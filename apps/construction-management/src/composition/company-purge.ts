import { companies } from "@repo/auth/construction/server";
import { Prisma, prisma, type PrismaClient } from "@repo/construction-db";

import type { CompanyDeletionStore } from "@/src/organization/application/company-deletion-handlers";
import type { CompanyDeletion } from "@/src/organization/domain/company-deletion";
import { PrismaCompanyDeletionStore } from "@/src/organization/infrastructure/prisma-company-deletion-store";
import type { ObjectStorage } from "@/src/shared-kernel/files";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";
import type { QueueHandler } from "@/src/shared-kernel/queue";

/**
 * Purging a Company whose deletion came due (CM-907, ADR CM-0021 §10).
 * It spans every context's schema, so it lives in the composition root.
 */

/** The daily queue job that purges due Companies. */
export const COMPANY_PURGE_JOB = "organization.company_purge";

/** The purge's own limit; a drain never starts it with less budget left. */
export const COMPANY_PURGE_LIMIT_MS = 240_000;

/**
 * Tables that keep a purged Company's rows: subscriptions and their orders
 * are the GST invoices, kept 8 years, detached from the Company that no
 * longer exists. `company_deletions` and `account_deletions` have no
 * `workspace_id` and are never touched.
 */
export const KEPT_TABLES: ReadonlySet<string> = new Set([
  "construction_organization.subscriptions",
  "construction_organization.subscription_orders",
]);

type Edge = {
  child: string;
  parent: string;
  childColumns: string[];
  parentColumns: string[];
};

function quoted(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

/** `schema.table` → `"schema"."table"`. */
function relation(qualified: string): string {
  const [schema = "", table = ""] = qualified.split(".");
  return `${quoted(schema)}.${quoted(table)}`;
}

/** Every Company table: a `workspace_id` column in a `construction_*` schema. */
async function companyTables(tx: Prisma.TransactionClient): Promise<string[]> {
  const rows = await tx.$queryRaw<{ name: string }[]>(Prisma.sql`
    SELECT c.table_schema || '.' || c.table_name AS name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.column_name = 'workspace_id'
      AND c.table_schema LIKE 'construction\\_%'
      AND t.table_type = 'BASE TABLE'
    ORDER BY 1
  `);
  return rows.map((row) => row.name).filter((name) => !KEPT_TABLES.has(name));
}

/**
 * Foreign keys between `construction_*` tables that stop a parent row
 * being deleted while a child row points at it (RESTRICT or NO ACTION).
 * CASCADE and SET NULL keys need nothing.
 */
async function blockingEdges(tx: Prisma.TransactionClient): Promise<Edge[]> {
  return tx.$queryRaw<Edge[]>(Prisma.sql`
    SELECT
      cn.nspname || '.' || cr.relname AS child,
      pn.nspname || '.' || pr.relname AS parent,
      ARRAY(
        SELECT a.attname::text FROM unnest(con.conkey) WITH ORDINALITY k(attnum, i)
        JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
        ORDER BY k.i
      ) AS "childColumns",
      ARRAY(
        SELECT a.attname::text FROM unnest(con.confkey) WITH ORDINALITY k(attnum, i)
        JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.attnum
        ORDER BY k.i
      ) AS "parentColumns"
    FROM pg_constraint con
    JOIN pg_class cr ON cr.oid = con.conrelid
    JOIN pg_namespace cn ON cn.oid = cr.relnamespace
    JOIN pg_class pr ON pr.oid = con.confrelid
    JOIN pg_namespace pn ON pn.oid = pr.relnamespace
    WHERE con.contype = 'f'
      AND con.confdeltype IN ('a', 'r')
      AND cn.nspname LIKE 'construction\\_%'
      AND pn.nspname LIKE 'construction\\_%'
  `);
}

/**
 * Children first: a table comes before every table it points at with a
 * blocking key. A cycle (or a key through a table without `workspace_id`)
 * is left to the retry passes in `purgeCompanyRows`.
 */
export function deletionOrder(
  tables: readonly string[],
  edges: readonly Pick<Edge, "child" | "parent">[],
): string[] {
  const inSet = new Set(tables);
  const parentsOf = new Map<string, Set<string>>();
  for (const table of tables) parentsOf.set(table, new Set());
  // Count, for each table, the children that must go before it.
  const waitingOn = new Map<string, number>(tables.map((t) => [t, 0]));
  for (const { child, parent } of edges) {
    if (child === parent || !inSet.has(child) || !inSet.has(parent)) continue;
    const parents = parentsOf.get(child);
    if (parents == null || parents.has(parent)) continue;
    parents.add(parent);
    waitingOn.set(parent, (waitingOn.get(parent) ?? 0) + 1);
  }
  const ready = tables.filter((table) => waitingOn.get(table) === 0).sort();
  const order: string[] = [];
  while (ready.length > 0) {
    const table = ready.shift();
    if (table == null) break;
    order.push(table);
    for (const parent of [...(parentsOf.get(table) ?? [])].sort()) {
      const left = (waitingOn.get(parent) ?? 0) - 1;
      waitingOn.set(parent, left);
      if (left === 0) ready.push(parent);
    }
  }
  const placed = new Set(order);
  return [...order, ...tables.filter((table) => !placed.has(table)).sort()];
}

/**
 * Deletes every row of the Company in every `construction_*` schema, in
 * one transaction, and returns the rows deleted per table (cascaded child
 * rows are not counted separately). Kept tables are left alone.
 *
 * 1. Child tables without `workspace_id` that block a Company table (e.g.
 *    `sequence_counters` → `sequence_rules`) lose the rows pointing at the
 *    Company's rows.
 * 2. Company tables are deleted children first; a delete that a key still
 *    blocks is rolled back to a savepoint and retried in the next pass,
 *    until a pass makes no progress (then the purge fails and is retried
 *    by the queue).
 */
export async function purgeCompanyRows(
  workspaceId: string,
  db: PrismaClient = prisma,
): Promise<Record<string, number>> {
  return db.$transaction(
    async (tx) => {
      const summary: Record<string, number> = {};
      const count = (table: string, rows: number) => {
        if (rows > 0) summary[table] = (summary[table] ?? 0) + rows;
      };
      const tables = await companyTables(tx);
      const edges = await blockingEdges(tx);
      const companySet = new Set(tables);

      for (const edge of edges) {
        if (companySet.has(edge.child) || KEPT_TABLES.has(edge.child)) continue;
        if (!companySet.has(edge.parent)) continue;
        const join = edge.childColumns
          .map(
            (column, index) =>
              `c.${quoted(column)} = p.${quoted(edge.parentColumns[index] ?? column)}`,
          )
          .join(" AND ");
        count(
          edge.child,
          await tx.$executeRawUnsafe(
            `DELETE FROM ${relation(edge.child)} c USING ${relation(edge.parent)} p WHERE ${join} AND p.workspace_id = $1`,
            workspaceId,
          ),
        );
      }

      let remaining = deletionOrder(tables, edges);
      while (remaining.length > 0) {
        const blocked: string[] = [];
        for (const table of remaining) {
          await tx.$executeRawUnsafe("SAVEPOINT company_purge_step");
          try {
            count(
              table,
              await tx.$executeRawUnsafe(
                `DELETE FROM ${relation(table)} WHERE workspace_id = $1`,
                workspaceId,
              ),
            );
            await tx.$executeRawUnsafe("RELEASE SAVEPOINT company_purge_step");
          } catch {
            await tx.$executeRawUnsafe(
              "ROLLBACK TO SAVEPOINT company_purge_step",
            );
            blocked.push(table);
          }
        }
        if (blocked.length === remaining.length)
          throw new Error(
            `Company ${workspaceId} could not be purged; still blocked: ${blocked.join(", ")}.`,
          );
        remaining = blocked;
      }
      return summary;
    },
    { timeout: COMPANY_PURGE_LIMIT_MS - 10_000, maxWait: 10_000 },
  );
}

/** Every key the Company stored, live or already released. */
async function storedKeys(
  workspaceId: string,
  db: PrismaClient,
): Promise<string[]> {
  const rows = await db.constructionOrganizationStoredFile.findMany({
    where: { workspaceId },
    select: { key: true },
  });
  return [...new Set(rows.map((row) => row.key))];
}

export type PurgeDeps = {
  prisma?: PrismaClient;
  storage?: ObjectStorage;
  store?: CompanyDeletionStore;
  clock?: () => Date;
  /** Deletes the Workspace and its memberships in `@repo/auth`. */
  purgeWorkspace?: (workspaceId: string) => Promise<void>;
};

/**
 * Purges one due Company: its rows (`purgeCompanyRows`), then its stored
 * objects, then its memberships, invitations and Workspace in
 * `@repo/auth`, and marks the `company_deletions` record completed with
 * the summary. An object that cannot be deleted is left for the daily
 * orphan clean-up (CM-901), which removes objects under
 * `companies/<id>/` that no `stored_files` row names.
 */
export async function purgeCompany(
  deletion: CompanyDeletion,
  deps: PurgeDeps = {},
): Promise<Record<string, number>> {
  const db = deps.prisma ?? prisma;
  const storage = deps.storage ?? objectStorage();
  const store = deps.store ?? new PrismaCompanyDeletionStore(db);
  const clock = deps.clock ?? (() => new Date());
  const keys = await storedKeys(deletion.workspaceId, db);
  const summary = await purgeCompanyRows(deletion.workspaceId, db);
  let objects = 0;
  for (const key of keys) {
    try {
      await storage.delete(key);
      objects += 1;
    } catch (error) {
      console.error(`Company purge could not delete ${key}`, error);
    }
  }
  if (objects > 0) summary["storage.objects"] = objects;
  await (deps.purgeWorkspace ?? ((id) => companies.purge(id)))(
    deletion.workspaceId,
  );
  deletion.complete(summary, clock());
  await store.save(deletion);
  return summary;
}

/**
 * The daily `organization.company_purge` job (registered in
 * `src/composition/queue.ts`): purges every Company whose cooling-off has
 * ended, oldest first, while its time lasts. What is left waits for the
 * next day.
 */
export function companyPurgeQueueHandler(deps: PurgeDeps = {}): QueueHandler {
  return {
    type: COMPANY_PURGE_JOB,
    timeLimitMs: COMPANY_PURGE_LIMIT_MS,
    async run(_job, signal) {
      const db = deps.prisma ?? prisma;
      const store = deps.store ?? new PrismaCompanyDeletionStore(db);
      const clock = deps.clock ?? (() => new Date());
      const due = await store.listDue(clock(), 20);
      for (const deletion of due) {
        if (signal.aborted) break;
        await purgeCompany(deletion, { ...deps, prisma: db, store });
      }
    },
  };
}
