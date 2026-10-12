import { Prisma } from "@repo/construction-db";

import {
  calendarDateFromDb,
  calendarDateToDb,
} from "@/src/shared-kernel/calendar-date";

import type {
  CategoryFacts,
  ReferenceUse,
  TransactionLookups,
} from "../application/transaction-common";
import type {
  StoredTransaction,
  TransactionStore,
} from "../application/transaction-handlers";

type Row = Prisma.ConstructionFinanceTransactionGetPayload<object>;

export function toStoredTransaction(row: Row): StoredTransaction {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    number: row.number,
    projectId: row.projectId,
    storeId: row.storeId,
    transactionDate: calendarDateFromDb(row.transactionDate),
    type: row.type,
    accountId: row.accountId,
    paymentCategoryId: row.paymentCategoryId,
    mode: row.mode,
    chequeNumber: row.chequeNumber,
    reference: row.reference,
    modeDate: row.modeDate == null ? null : calendarDateFromDb(row.modeDate),
    counterpartyKind: row.counterpartyKind,
    counterpartyId: row.counterpartyId,
    counterpartyName: row.counterpartyName,
    amount: row.amount,
    description: row.description,
    approvalStatus: row.approvalStatus,
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt,
    rejectReason: row.rejectReason,
    importBatchId: row.importBatchId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

function columns(row: StoredTransaction) {
  return {
    transactionDate: calendarDateToDb(row.transactionDate),
    type: row.type,
    accountId: row.accountId,
    paymentCategoryId: row.paymentCategoryId,
    mode: row.mode,
    chequeNumber: row.chequeNumber,
    reference: row.reference,
    modeDate: row.modeDate == null ? null : calendarDateToDb(row.modeDate),
    counterpartyKind: row.counterpartyKind,
    counterpartyId: row.counterpartyId,
    counterpartyName: row.counterpartyName,
    amount: row.amount,
    description: row.description,
    approvalStatus: row.approvalStatus,
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt,
    rejectReason: row.rejectReason,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
  };
}

/** Prisma store of Transactions (CM-702). */
export const prismaTransactionStore: TransactionStore = {
  async find(db, workspaceId, id) {
    const row = await db.constructionFinanceTransaction.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    return row == null ? null : toStoredTransaction(row);
  },

  async lock(db, workspaceId, id) {
    const locked = await db.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id::text AS id FROM construction_finance.transactions
        WHERE id = ${id}::uuid AND workspace_id = ${workspaceId}
          AND deleted_at IS NULL
        FOR UPDATE`,
    );
    if (locked.length === 0) return null;
    return prismaTransactionStore.find(db, workspaceId, id);
  },

  async insert(db, row) {
    await db.constructionFinanceTransaction.create({
      data: {
        ...columns(row),
        id: row.id,
        workspaceId: row.workspaceId,
        number: row.number,
        projectId: row.projectId,
        storeId: row.storeId,
        importBatchId: row.importBatchId,
        createdAt: row.createdAt,
        createdBy: row.createdBy,
      },
    });
  },

  async save(db, row) {
    await db.constructionFinanceTransaction.update({
      where: { id: row.id },
      data: columns(row),
    });
  },

  async tombstone(db, id, by, at) {
    await db.constructionFinanceTransaction.update({
      where: { id },
      data: { deletedAt: at, deletedBy: by, updatedAt: at, updatedBy: by },
    });
  },
};

/** Normalised reference for the duplicate check: no spaces, upper case. */
const NORMAL = (column: Prisma.Sql) =>
  Prisma.sql`upper(regexp_replace(${column}, '[[:space:]]', '', 'g'))`;

/** What Transactions and transfers read besides their own rows. */
export const prismaTransactionLookups: TransactionLookups = {
  async paymentCategories(db, workspaceId, ids) {
    if (ids.length === 0) return new Map<string, CategoryFacts>();
    const rows = await db.constructionFinancePaymentCategory.findMany({
      where: { workspaceId, id: { in: [...new Set(ids)] }, deletedAt: null },
      select: { id: true, name: true, disabledAt: true },
    });
    return new Map(
      rows.map((row) => [
        row.id,
        { id: row.id, name: row.name, disabled: row.disabledAt != null },
      ]),
    );
  },

  async otherParties(db, workspaceId, ids) {
    if (ids.length === 0) return new Map();
    const rows = await db.constructionFinanceOtherParty.findMany({
      where: { workspaceId, id: { in: [...new Set(ids)] }, deletedAt: null },
      select: { id: true, name: true },
    });
    return new Map(rows.map((row) => [row.id, row]));
  },

  async referenceUse(db, workspaceId, accountId, reference, except) {
    const value = reference.replace(/\s/g, "").toUpperCase();
    const exceptType = except?.type ?? null;
    const exceptId = except?.id ?? null;
    const rows = await db.$queryRaw<
      { type: ReferenceUse["type"]; id: string; number: string; date: Date }[]
    >(
      Prisma.sql`SELECT type, id, number, date FROM (
          SELECT 'transaction' AS type, id::text AS id, number, transaction_date AS date, created_at
            FROM construction_finance.transactions
            WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL
              AND approval_status <> 'rejected' AND account_id = ${accountId}::uuid
              AND (${NORMAL(Prisma.sql`cheque_number`)} = ${value}
                OR ${NORMAL(Prisma.sql`reference`)} = ${value})
          UNION ALL
          SELECT 'account_transfer', id::text, number, transfer_date, created_at
            FROM construction_finance.account_transfers
            WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL
              AND approval_status <> 'rejected'
              AND (from_account_id = ${accountId}::uuid OR to_account_id = ${accountId}::uuid)
              AND ${NORMAL(Prisma.sql`reference`)} = ${value}
          UNION ALL
          SELECT 'party_payment', id::text, number, payment_date, created_at
            FROM construction_finance.party_payments
            WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL
              AND account_id = ${accountId}::uuid
              AND (${NORMAL(Prisma.sql`cheque_number`)} = ${value}
                OR ${NORMAL(Prisma.sql`reference`)} = ${value})
        ) AS uses
        WHERE ${exceptType}::text IS NULL
          OR NOT (type = ${exceptType}::text AND id = ${exceptId}::text)
        ORDER BY created_at
        LIMIT 1`,
    );
    const row = rows[0];
    return row == null
      ? null
      : {
          type: row.type,
          id: row.id,
          number: row.number,
          date: calendarDateFromDb(row.date),
        };
  },

  async accounts(db, workspaceId, ids) {
    if (ids.length === 0) return new Map();
    const rows = await db.constructionFinanceAccount.findMany({
      where: { workspaceId, id: { in: [...new Set(ids)] } },
      select: { id: true, name: true, kind: true },
    });
    return new Map(
      rows.map((row) => [row.id, { name: row.name, kind: row.kind }]),
    );
  },
};
