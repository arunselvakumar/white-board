import { Prisma } from "@repo/construction-db";

import type {
  RegisterFilters,
  RegisterRow,
  RegisterStore,
} from "../application/transaction-register";
import { toStoredTransaction } from "./transaction-store";
import { toStoredTransfer } from "./transfer-store";

function and(parts: Prisma.Sql[]): Prisma.Sql {
  return parts.length === 0
    ? Prisma.empty
    : Prisma.join(parts, " AND ", "AND ");
}

/** Transactions matching the filters, or null when they cannot match. */
function transactionRows(filters: RegisterFilters): Prisma.Sql | null {
  if (filters.type === "transfer") return null;
  const parts: Prisma.Sql[] = [];
  if (filters.projectId != null)
    parts.push(Prisma.sql`project_id = ${filters.projectId}::uuid`);
  if (filters.from != null)
    parts.push(Prisma.sql`transaction_date >= ${filters.from}::date`);
  if (filters.to != null)
    parts.push(Prisma.sql`transaction_date <= ${filters.to}::date`);
  if (filters.type === "in") parts.push(Prisma.sql`type = 'payment_in'`);
  if (filters.type === "out") parts.push(Prisma.sql`type = 'payment_out'`);
  if (filters.accountId != null)
    parts.push(Prisma.sql`account_id = ${filters.accountId}::uuid`);
  if (filters.paymentCategoryId != null)
    parts.push(
      Prisma.sql`payment_category_id = ${filters.paymentCategoryId}::uuid`,
    );
  if (filters.mode != null)
    parts.push(Prisma.sql`mode::text = ${filters.mode}`);
  if (filters.counterpartyKind != null)
    parts.push(
      Prisma.sql`counterparty_kind::text = ${filters.counterpartyKind}`,
    );
  if (filters.approvalStatus != null)
    parts.push(Prisma.sql`approval_status::text = ${filters.approvalStatus}`);
  return Prisma.sql`SELECT 'transaction' AS doc, id, created_at,
      CASE WHEN type = 'payment_in' THEN 'in' ELSE 'out' END AS dir,
      amount, approval_status::text AS status
    FROM construction_finance.transactions
    WHERE workspace_id = ${filters.workspaceId} AND deleted_at IS NULL
      ${and(parts)}`;
}

/** Transfers matching the filters, or null when they cannot match. */
function transferRows(filters: RegisterFilters): Prisma.Sql | null {
  if (
    filters.type === "in" ||
    filters.type === "out" ||
    filters.paymentCategoryId != null ||
    filters.counterpartyKind != null
  )
    return null;
  const parts: Prisma.Sql[] = [];
  if (filters.projectId != null)
    parts.push(Prisma.sql`project_id = ${filters.projectId}::uuid`);
  if (filters.from != null)
    parts.push(Prisma.sql`transfer_date >= ${filters.from}::date`);
  if (filters.to != null)
    parts.push(Prisma.sql`transfer_date <= ${filters.to}::date`);
  if (filters.accountId != null)
    parts.push(
      Prisma.sql`(from_account_id = ${filters.accountId}::uuid OR to_account_id = ${filters.accountId}::uuid)`,
    );
  if (filters.mode != null)
    parts.push(Prisma.sql`mode::text = ${filters.mode}`);
  if (filters.approvalStatus != null)
    parts.push(Prisma.sql`approval_status::text = ${filters.approvalStatus}`);
  return Prisma.sql`SELECT 'transfer' AS doc, id, created_at, 'transfer' AS dir,
      amount, approval_status::text AS status
    FROM construction_finance.account_transfers
    WHERE workspace_id = ${filters.workspaceId} AND deleted_at IS NULL
      ${and(parts)}`;
}

/**
 * The Transactions register as one list (CM-702): Transactions and
 * transfers newest first (by when they were recorded), bidirectional
 * cursors, the count and the totals of the filtered rows.
 */
export const prismaRegisterStore: RegisterStore = {
  async list(db, filters) {
    const branches = [transactionRows(filters), transferRows(filters)].filter(
      (sql): sql is Prisma.Sql => sql != null,
    );
    if (branches.length === 0)
      return {
        items: [],
        hasMore: false,
        total: 0,
        totals: { in: 0n, out: 0n, transfer: 0n },
      };
    const rows = Prisma.join(branches, " UNION ALL ");
    const cursor = filters.after ?? filters.before;
    const backwards = filters.before != null;
    const page =
      cursor == null
        ? Prisma.empty
        : backwards
          ? Prisma.sql`WHERE (created_at, id) > (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`
          : Prisma.sql`WHERE (created_at, id) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`;
    const order = backwards
      ? Prisma.sql`ORDER BY created_at ASC, id ASC`
      : Prisma.sql`ORDER BY created_at DESC, id DESC`;
    const counted =
      filters.approvalStatus === "rejected"
        ? Prisma.sql`status = 'rejected'`
        : Prisma.sql`status <> 'rejected'`;
    const [found, aggregate] = await Promise.all([
      db.$queryRaw<{ doc: "transaction" | "transfer"; id: string }[]>(
        Prisma.sql`SELECT doc, id::text AS id FROM (${rows}) AS register
          ${page} ${order} LIMIT ${filters.limit + 1}`,
      ),
      db.$queryRaw<
        { total: number; in: bigint; out: bigint; transfer: bigint }[]
      >(
        Prisma.sql`SELECT COUNT(*)::int AS total,
            COALESCE(SUM(amount) FILTER (WHERE dir = 'in' AND ${counted}), 0)::bigint AS "in",
            COALESCE(SUM(amount) FILTER (WHERE dir = 'out' AND ${counted}), 0)::bigint AS "out",
            COALESCE(SUM(amount) FILTER (WHERE dir = 'transfer' AND ${counted}), 0)::bigint AS "transfer"
          FROM (${rows}) AS register`,
      ),
    ]);
    const hasMore = found.length > filters.limit;
    const ids = found.slice(0, filters.limit);
    if (backwards) ids.reverse();
    const transactionIds = ids.flatMap((row) =>
      row.doc === "transaction" ? [row.id] : [],
    );
    const transferIds = ids.flatMap((row) =>
      row.doc === "transfer" ? [row.id] : [],
    );
    const [transactions, transfers] = await Promise.all([
      transactionIds.length === 0
        ? []
        : db.constructionFinanceTransaction.findMany({
            where: { id: { in: transactionIds } },
          }),
      transferIds.length === 0
        ? []
        : db.constructionFinanceAccountTransfer.findMany({
            where: { id: { in: transferIds } },
          }),
    ]);
    const byId = new Map<string, RegisterRow>([
      ...transactions.map(
        (row) =>
          [
            row.id,
            { type: "transaction", row: toStoredTransaction(row) },
          ] as const,
      ),
      ...transfers.map(
        (row) =>
          [row.id, { type: "transfer", row: toStoredTransfer(row) }] as const,
      ),
    ]);
    const totals = aggregate[0];
    return {
      items: ids.flatMap((row) => byId.get(row.id) ?? []),
      hasMore,
      total: totals?.total ?? 0,
      totals: {
        in: totals?.in ?? 0n,
        out: totals?.out ?? 0n,
        transfer: totals?.transfer ?? 0n,
      },
    };
  },
};
