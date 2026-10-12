import { Prisma } from "@repo/construction-db";

import {
  calendarDateFromDb,
  calendarDateToDb,
} from "@/src/shared-kernel/calendar-date";

import type {
  StoredTransfer,
  TransferStore,
} from "../application/transfer-handlers";

type Row = Prisma.ConstructionFinanceAccountTransferGetPayload<object>;

export function toStoredTransfer(row: Row): StoredTransfer {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    number: row.number,
    projectId: row.projectId,
    transferDate: calendarDateFromDb(row.transferDate),
    fromAccountId: row.fromAccountId,
    toAccountId: row.toAccountId,
    mode: row.mode,
    reference: row.reference,
    amount: row.amount,
    description: row.description,
    approvalStatus: row.approvalStatus,
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt,
    rejectReason: row.rejectReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

function columns(row: StoredTransfer) {
  return {
    transferDate: calendarDateToDb(row.transferDate),
    fromAccountId: row.fromAccountId,
    toAccountId: row.toAccountId,
    mode: row.mode,
    reference: row.reference,
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

/** Prisma store of account transfers (CM-702). */
export const prismaTransferStore: TransferStore = {
  async find(db, workspaceId, id) {
    const row = await db.constructionFinanceAccountTransfer.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    return row == null ? null : toStoredTransfer(row);
  },

  async lock(db, workspaceId, id) {
    const locked = await db.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id::text AS id FROM construction_finance.account_transfers
        WHERE id = ${id}::uuid AND workspace_id = ${workspaceId}
          AND deleted_at IS NULL
        FOR UPDATE`,
    );
    if (locked.length === 0) return null;
    return prismaTransferStore.find(db, workspaceId, id);
  },

  async insert(db, row) {
    await db.constructionFinanceAccountTransfer.create({
      data: {
        ...columns(row),
        id: row.id,
        workspaceId: row.workspaceId,
        number: row.number,
        projectId: row.projectId,
        createdAt: row.createdAt,
        createdBy: row.createdBy,
      },
    });
  },

  async save(db, row) {
    await db.constructionFinanceAccountTransfer.update({
      where: { id: row.id },
      data: columns(row),
    });
  },

  async tombstone(db, id, by, at) {
    await db.constructionFinanceAccountTransfer.update({
      where: { id },
      data: { deletedAt: at, deletedBy: by, updatedAt: at, updatedBy: by },
    });
  },
};
