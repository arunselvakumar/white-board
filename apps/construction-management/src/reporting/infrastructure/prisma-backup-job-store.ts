import { Prisma, type PrismaClient } from "@repo/construction-db";

import { recordAudit } from "@/src/shared-kernel/audit";
import {
  calendarDateFromDb,
  calendarDateToDb,
} from "@/src/shared-kernel/calendar-date";
import {
  markStoredFileDeleted,
  recordStoredFile,
} from "@/src/shared-kernel/files/stored-files";
import { enqueueJob, STALE_QUEUED_MS } from "@/src/shared-kernel/queue";

import type { BackupJobStore } from "../application/backup-ports";
import {
  BACKUP_FILE_KIND,
  type BackupJob,
  type BackupPart,
  type BackupStatus,
} from "../domain/backup-job";

type Row = Awaited<
  ReturnType<
    PrismaClient["constructionReportingBackupJob"]["findUniqueOrThrow"]
  >
>;

const UNFINISHED: BackupStatus[] = ["queued", "running"];

/** Retention runs as no one: the audit names the system. */
const SYSTEM = "system";

function partsOf(value: unknown): BackupPart[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw): BackupPart[] => {
    const part = raw as Partial<BackupPart> | null;
    if (typeof part?.module !== "string") return [];
    return [
      {
        module: part.module,
        key: typeof part.key === "string" ? part.key : null,
        rows: typeof part.rows === "number" ? part.rows : 0,
        bytes: typeof part.bytes === "number" ? part.bytes : 0,
        done: part.done === true,
        money: part.money === true,
        entities: Array.isArray(part.entities) ? part.entities : [],
        mediaFiles: typeof part.mediaFiles === "number" ? part.mediaFiles : 0,
      },
    ];
  });
}

function toJob(row: Row): BackupJob {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    scope: row.scope,
    modules: row.modules,
    fromDate: row.fromDate == null ? null : calendarDateFromDb(row.fromDate),
    toDate: row.toDate == null ? null : calendarDateFromDb(row.toDate),
    includeData: row.includeData,
    includeMedia: row.includeMedia,
    includesMoney: row.includesMoney,
    status: row.status,
    parts: partsOf(row.parts),
    fileKey: row.fileKey,
    fileName: row.fileName,
    bytes: row.bytes == null ? null : Number(row.bytes),
    error: row.error,
    requestedBy: row.requestedBy,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    expiresAt: row.expiresAt,
  };
}

function partsJson(parts: readonly BackupPart[]): Prisma.InputJsonValue {
  return parts.map((part) => ({ ...part, entities: [...part.entities] }));
}

/** `construction_reporting.backup_jobs` (CM-906). */
export function prismaBackupJobStore(db: PrismaClient): BackupJobStore {
  async function partFilesDeleted(
    tx: Prisma.TransactionClient,
    job: BackupJob,
    at: Date,
    keys: readonly (string | null)[] = [
      job.fileKey,
      ...job.parts.map((p) => p.key),
    ],
  ): Promise<void> {
    if (job.workspaceId == null) return;
    for (const key of keys)
      if (key != null)
        await markStoredFileDeleted(tx, job.workspaceId, key, at);
  }

  return {
    async create(job, parts) {
      return db.$transaction(async (tx) => {
        await tx.constructionReportingBackupJob.create({
          data: {
            id: job.id,
            workspaceId: job.workspaceId,
            projectId: job.projectId,
            scope: job.scope,
            modules: job.modules,
            fromDate:
              job.fromDate == null ? null : calendarDateToDb(job.fromDate),
            toDate: job.toDate == null ? null : calendarDateToDb(job.toDate),
            includeData: job.includeData,
            includeMedia: job.includeMedia,
            includesMoney: job.includesMoney,
            status: job.status,
            parts: partsJson(job.parts),
            requestedBy: job.requestedBy,
            createdAt: job.createdAt,
          },
        });
        const ids: string[] = [];
        for (const input of parts)
          ids.push(await enqueueJob(tx, input, job.createdAt));
        return ids;
      });
    },

    async get(id) {
      const row = await db.constructionReportingBackupJob.findUnique({
        where: { id },
      });
      return row == null ? null : toJob(row);
    },

    async listOwn(userId, workspaceId, page) {
      const before = page.before;
      const kind = page.kind ?? "all";
      if (kind === "backups" && workspaceId == null) return [];
      const rows = await db.constructionReportingBackupJob.findMany({
        where: {
          requestedBy: userId,
          OR: [
            ...(kind === "backups" ? [] : [{ scope: "my_data" as const }]),
            ...(workspaceId == null || kind === "exports"
              ? []
              : [{ workspaceId, scope: { not: "my_data" as const } }]),
          ],
          ...(before == null
            ? {}
            : {
                AND: [
                  {
                    OR: [
                      { createdAt: { lt: before.createdAt } },
                      { createdAt: before.createdAt, id: { lt: before.id } },
                    ],
                  },
                ],
              }),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: page.limit,
      });
      return rows.map(toJob);
    },

    countUnfinished(userId) {
      return db.constructionReportingBackupJob.count({
        where: { requestedBy: userId, status: { in: UNFINISHED } },
      });
    },

    async markRunning(id, now) {
      const updated = await db.$executeRaw(Prisma.sql`
        UPDATE construction_reporting.backup_jobs
           SET status = 'running', started_at = COALESCE(started_at, ${now})
         WHERE id = ${id}::uuid AND status IN ('queued', 'running')`);
      return updated > 0;
    },

    async completePart(id, part, zip, now) {
      return db.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<
          {
            status: string;
            parts: unknown;
            workspace_id: string | null;
            requested_by: string;
          }[]
        >(Prisma.sql`
          SELECT status::text AS status, parts, workspace_id, requested_by
            FROM construction_reporting.backup_jobs
           WHERE id = ${id}::uuid
           FOR UPDATE`);
        const row = locked[0];
        if (row == null || !["queued", "running"].includes(row.status))
          return null;
        const parts = partsOf(row.parts);
        const index = parts.findIndex((p) => p.module === part.module);
        if (index < 0) return null;
        const wasDone = parts[index]?.done === true;
        if (!wasDone) {
          parts[index] = part;
          await tx.constructionReportingBackupJob.update({
            where: { id },
            data: { parts: partsJson(parts) },
          });
          if (row.workspace_id != null && part.key != null)
            await recordStoredFile(tx, {
              workspaceId: row.workspace_id,
              key: part.key,
              kind: BACKUP_FILE_KIND,
              contentType: "application/zip",
              bytes: part.bytes,
              createdBy: row.requested_by,
              createdAt: now,
            });
        }
        const allDone = parts.every((p) => p.done);
        const zipQueueId = allDone ? await enqueueJob(tx, zip, now) : null;
        return { allDone, zipQueueId };
      });
    },

    async finish(id, done) {
      return db.$transaction(async (tx) => {
        const row = await tx.constructionReportingBackupJob.findUnique({
          where: { id },
        });
        if (row == null) return false;
        const job = toJob(row);
        const updated = await tx.constructionReportingBackupJob.updateMany({
          where: { id, status: { in: UNFINISHED } },
          data: {
            status: "done",
            fileKey: done.fileKey,
            fileName: done.fileName,
            bytes: BigInt(done.bytes),
            finishedAt: done.finishedAt,
            expiresAt: done.expiresAt,
            error: null,
          },
        });
        if (updated.count === 0) return false;
        if (job.workspaceId != null)
          await recordStoredFile(tx, {
            workspaceId: job.workspaceId,
            key: done.fileKey,
            kind: BACKUP_FILE_KIND,
            contentType: "application/zip",
            bytes: done.bytes,
            createdBy: job.requestedBy,
            createdAt: done.finishedAt,
          });
        await partFilesDeleted(
          tx,
          job,
          done.finishedAt,
          job.parts.map((p) => p.key),
        );
        return true;
      });
    },

    async fail(id, error, now) {
      return db.$transaction(async (tx) => {
        const updated = await tx.constructionReportingBackupJob.updateMany({
          where: { id, status: { in: UNFINISHED } },
          data: { status: "failed", error, finishedAt: now },
        });
        if (updated.count === 0) return null;
        const row = await tx.constructionReportingBackupJob.findUniqueOrThrow({
          where: { id },
        });
        const job = toJob(row);
        await partFilesDeleted(tx, job, now);
        return job;
      });
    },

    async delete(job, now) {
      await db.$transaction(async (tx) => {
        await partFilesDeleted(tx, job, now);
        await tx.constructionReportingBackupJob.deleteMany({
          where: { id: job.id },
        });
      });
    },

    async expirable(now, limit) {
      const rows = await db.constructionReportingBackupJob.findMany({
        where: { status: "done", expiresAt: { lte: now } },
        orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
        take: limit,
      });
      return rows.map(toJob);
    },

    async markExpired(job, now) {
      return db.$transaction(async (tx) => {
        const updated = await tx.constructionReportingBackupJob.updateMany({
          where: { id: job.id, status: "done" },
          data: { status: "expired", fileKey: null },
        });
        if (updated.count === 0) return false;
        await partFilesDeleted(tx, job, now);
        if (job.workspaceId != null)
          await recordAudit(tx, {
            workspaceId: job.workspaceId,
            actorUserId: SYSTEM,
            action: "backup_job.expired",
            entityType: "backup_job",
            entityId: job.id,
            before: {
              status: "done",
              fileKey: job.fileKey,
              fileName: job.fileName,
            },
            after: { status: "expired" },
            occurredAt: now,
          });
        return true;
      });
    },

    async stalledQueueJobs(backupIds, now) {
      if (backupIds.length === 0) return [];
      const patterns = backupIds.flatMap((id) => [
        `backup.part:${id}:%`,
        `backup.zip:${id}`,
      ]);
      const staleBefore = new Date(now.getTime() - STALE_QUEUED_MS);
      const rows = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT id::text AS id FROM construction_organization.queue_jobs
         WHERE dedupe_key LIKE ANY(${patterns}::text[])
           AND ((status = 'queued' AND run_after <= ${now} AND created_at <= ${staleBefore})
             OR (status = 'running' AND lease_until < ${now}))`);
      return rows.map((row) => row.id);
    },
  };
}
