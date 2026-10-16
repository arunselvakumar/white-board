import { Prisma, type PrismaClient } from "@repo/construction-db";

import { newId } from "../ids";
import {
  LEASE_MARGIN_MS,
  type EnqueueInput,
  type QueueJob,
  type QueueStore,
} from "./queue";

/** Anything that can run SQL: the client or a transaction. */
export type QueueWriter = Pick<PrismaClient, "$queryRaw">;

/**
 * Adds a job inside the caller's transaction when given one, so the job
 * exists exactly when the change that needs it commits. A `dedupeKey`
 * already queued or running adds nothing.
 */
export async function enqueueJob(
  db: QueueWriter,
  input: EnqueueInput,
  now: Date = new Date(),
): Promise<string> {
  const payload = JSON.stringify(input.payload ?? null);
  const rows = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO construction_organization.queue_jobs
      (id, workspace_id, type, payload, status, attempts, max_attempts,
       run_after, dedupe_key, created_at)
    VALUES (${newId()}::uuid, ${input.workspaceId}, ${input.type},
            ${payload}::jsonb, 'queued', 0, ${input.maxAttempts ?? 3},
            ${input.runAfter ?? now}, ${input.dedupeKey ?? null}, ${now})
    ON CONFLICT (dedupe_key)
      WHERE dedupe_key IS NOT NULL AND status IN ('queued', 'running')
      DO NOTHING
    RETURNING id`;
  const created = rows[0]?.id;
  if (created != null) return created;
  const existing = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM construction_organization.queue_jobs
     WHERE dedupe_key = ${input.dedupeKey ?? null}
       AND status IN ('queued', 'running')
     LIMIT 1`;
  const id = existing[0]?.id;
  if (id == null) throw new Error("The job could not be queued.");
  return id;
}

type ClaimRow = {
  id: string;
  workspace_id: string | null;
  type: string;
  payload: unknown;
  attempts: number;
  max_attempts: number;
};

/** `construction_organization.queue_jobs` (ADR CM-0021 §1). */
export function prismaQueueStore(db: PrismaClient): QueueStore {
  return {
    enqueue(input, now) {
      return enqueueJob(db, input, now);
    },

    async claim(types, now, onlyIds) {
      if (types.size === 0) return null;
      const only =
        onlyIds == null
          ? Prisma.empty
          : Prisma.sql`AND id = ANY(${[...onlyIds]}::uuid[])`;
      // One CASE per type gives each job its own lease.
      const leases = Prisma.join(
        [...types].map(
          ([type, limit]) =>
            Prisma.sql`WHEN ${type} THEN ${limit + LEASE_MARGIN_MS}::int`,
        ),
        " ",
      );
      const typeList = [...types.keys()];
      const rows = await db.$queryRaw<ClaimRow[]>`
        UPDATE construction_organization.queue_jobs AS q
           SET status = 'running',
               attempts = q.attempts + 1,
               started_at = ${now},
               lease_until = ${now}::timestamptz
                 + make_interval(secs => (CASE q.type ${leases} END) / 1000.0)
         WHERE q.id = (
           SELECT id FROM construction_organization.queue_jobs
            WHERE type = ANY(${typeList}::text[]) ${only}
              AND ((status = 'queued' AND run_after <= ${now})
                OR (status = 'running' AND lease_until < ${now}))
            ORDER BY run_after, created_at
            FOR UPDATE SKIP LOCKED
            LIMIT 1)
        RETURNING q.id, q.workspace_id, q.type, q.payload, q.attempts,
                  q.max_attempts`;
      const row = rows[0];
      if (row == null) return null;
      const job: QueueJob = {
        id: row.id,
        workspaceId: row.workspace_id,
        type: row.type,
        payload: row.payload,
        attempts: row.attempts,
        maxAttempts: row.max_attempts,
      };
      return job;
    },

    async complete(id, now) {
      await db.$executeRaw`
        UPDATE construction_organization.queue_jobs
           SET status = 'done', finished_at = ${now}, lease_until = NULL
         WHERE id = ${id}::uuid`;
    },

    async retry(id, error, runAfter) {
      await db.$executeRaw`
        UPDATE construction_organization.queue_jobs
           SET status = 'queued', run_after = ${runAfter},
               lease_until = NULL, last_error = ${error}
         WHERE id = ${id}::uuid`;
    },

    async giveUp(id, error, now) {
      await db.$executeRaw`
        UPDATE construction_organization.queue_jobs
           SET status = 'failed', finished_at = ${now},
               lease_until = NULL, last_error = ${error}
         WHERE id = ${id}::uuid`;
    },

    async hasUnfinished(dedupeKey) {
      const rows = await db.$queryRaw<{ n: number }[]>`
        SELECT 1 AS n FROM construction_organization.queue_jobs
         WHERE dedupe_key = ${dedupeKey} AND status IN ('queued', 'running')
         LIMIT 1`;
      return rows.length > 0;
    },
  };
}
