import { Prisma } from "@repo/construction-db";

import {
  calendarDateFromDb,
  calendarDateToDb,
} from "@/src/shared-kernel/calendar-date";

import type {
  AccountStore,
  PendingFigures,
  StoredAccount,
} from "../application/account-handlers";

type Row = Prisma.ConstructionFinanceAccountGetPayload<object>;

function toStored(row: Row): StoredAccount {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    kind: row.kind,
    name: row.name,
    bankName: row.bankName,
    accountNumber: row.accountNumber,
    ifsc: row.ifsc,
    branch: row.branch,
    holderMemberId: row.holderMemberId,
    isPrimary: row.isPrimary,
    openingDate: calendarDateFromDb(row.openingDate),
    isSeed: row.isSeed,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Pending documents per account and their signed effect if approved:
 * Transactions (in +, out −), both sides of transfers, petty-cash vouchers
 * (receipt +, payment and transfer −, the transfer's destination +) and
 * Other Expenses (−).
 */
const PENDING_SQL = (workspaceId: string, ids: readonly string[]) =>
  Prisma.sql`SELECT account_id AS "accountId", COUNT(*)::int AS "count",
      COALESCE(SUM(amount), 0)::bigint AS "total"
    FROM (
      SELECT account_id, CASE WHEN type = 'payment_in' THEN amount ELSE -amount END AS amount
        FROM construction_finance.transactions
        WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL AND approval_status = 'pending'
      UNION ALL
      SELECT from_account_id, -amount FROM construction_finance.account_transfers
        WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL AND approval_status = 'pending'
      UNION ALL
      SELECT to_account_id, amount FROM construction_finance.account_transfers
        WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL AND approval_status = 'pending'
      UNION ALL
      SELECT account_id, CASE WHEN voucher_type = 'receipt' THEN amount ELSE -amount END
        FROM construction_finance.petty_cash_vouchers
        WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL AND approval_status = 'pending'
      UNION ALL
      SELECT to_account_id, amount FROM construction_finance.petty_cash_vouchers
        WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL AND approval_status = 'pending'
          AND voucher_type = 'transfer'
      UNION ALL
      SELECT account_id, -amount FROM construction_finance.other_expenses
        WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL AND approval_status = 'pending'
    ) AS pending
    WHERE account_id = ANY(${[...ids]}::uuid[])
    GROUP BY account_id`;

/** Prisma store of company accounts (CM-701). */
export const prismaAccountStore: AccountStore = {
  async find(db, workspaceId, id) {
    const row = await db.constructionFinanceAccount.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    return row == null ? null : toStored(row);
  },

  async lock(db, workspaceId, id) {
    const locked = await db.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id::text AS id FROM construction_finance.accounts
        WHERE id = ${id}::uuid AND workspace_id = ${workspaceId}
          AND deleted_at IS NULL
        FOR UPDATE`,
    );
    if (locked.length === 0) return null;
    return prismaAccountStore.find(db, workspaceId, id);
  },

  async listCompany(db, workspaceId) {
    const rows = await db.constructionFinanceAccount.findMany({
      where: { workspaceId, deletedAt: null, kind: { in: ["cash", "bank"] } },
    });
    return rows.map(toStored);
  },

  async nameTaken(db, workspaceId, name, exceptId) {
    const rows = await db.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id::text AS id FROM construction_finance.accounts
        WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL
          AND lower(name) = lower(${name})
          AND (${exceptId}::uuid IS NULL OR id <> ${exceptId}::uuid)
        LIMIT 1`,
    );
    return rows.length > 0;
  },

  async insert(db, row) {
    await db.constructionFinanceAccount.create({
      data: {
        id: row.id,
        workspaceId: row.workspaceId,
        kind: row.kind,
        name: row.name,
        bankName: row.bankName,
        accountNumber: row.accountNumber,
        ifsc: row.ifsc,
        branch: row.branch,
        openingDate: calendarDateToDb(row.openingDate),
        createdAt: row.at,
        updatedAt: row.at,
        createdBy: row.by,
        updatedBy: row.by,
      },
    });
  },

  async update(db, id, fields) {
    await db.constructionFinanceAccount.update({
      where: { id },
      data: {
        name: fields.name,
        bankName: fields.bankName,
        accountNumber: fields.accountNumber,
        ifsc: fields.ifsc,
        branch: fields.branch,
        openingDate: calendarDateToDb(fields.openingDate),
        updatedAt: fields.at,
        updatedBy: fields.by,
      },
    });
  },

  async setPrimary(db, workspaceId, id, by, at) {
    // One primary change at a time per Company: two Set As Primary on
    // different accounts would otherwise both clear and set, and the
    // loser would hit the one-primary index instead of finishing.
    await db.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`finance-primary:${workspaceId}`}, 0))`,
    );
    await db.constructionFinanceAccount.updateMany({
      where: { workspaceId, isPrimary: true, deletedAt: null },
      data: { isPrimary: false, updatedAt: at, updatedBy: by },
    });
    await db.constructionFinanceAccount.update({
      where: { id },
      data: { isPrimary: true, updatedAt: at, updatedBy: by },
    });
  },

  async tombstone(db, id, by, at) {
    await db.constructionFinanceAccount.update({
      where: { id },
      data: { deletedAt: at, deletedBy: by, updatedAt: at, updatedBy: by },
    });
  },

  async pending(db, workspaceId, ids) {
    if (ids.length === 0) return new Map<string, PendingFigures>();
    const rows = await db.$queryRaw<
      { accountId: string; count: number; total: bigint }[]
    >(PENDING_SQL(workspaceId, ids));
    return new Map(
      rows.map((row) => [
        row.accountId,
        { count: row.count, total: row.total },
      ]),
    );
  },

  async hasOtherEntries(db, workspaceId, id) {
    const row = await db.constructionFinanceAccountEntry.findFirst({
      where: {
        workspaceId,
        accountId: id,
        NOT: { sourceType: "account", sourceId: id },
      },
      select: { id: true },
    });
    return row != null;
  },

  async namingDocument(db, workspaceId, id) {
    const rows = await db.$queryRaw<{ type: string; number: string }[]>(
      Prisma.sql`SELECT type, number FROM (
          SELECT 'transaction' AS type, number, 1 AS rank FROM construction_finance.transactions
            WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL AND account_id = ${id}::uuid
          UNION ALL
          SELECT 'account_transfer', number, 2 FROM construction_finance.account_transfers
            WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL
              AND (from_account_id = ${id}::uuid OR to_account_id = ${id}::uuid)
          UNION ALL
          SELECT 'petty_cash_voucher', number, 3 FROM construction_finance.petty_cash_vouchers
            WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL
              AND (account_id = ${id}::uuid OR to_account_id = ${id}::uuid)
          UNION ALL
          SELECT 'other_expense', number, 4 FROM construction_finance.other_expenses
            WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL AND account_id = ${id}::uuid
          UNION ALL
          SELECT 'party_payment', number, 5 FROM construction_finance.party_payments
            WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL AND account_id = ${id}::uuid
        ) AS documents
        ORDER BY rank
        LIMIT 1`,
    );
    return rows[0] ?? null;
  },
};
