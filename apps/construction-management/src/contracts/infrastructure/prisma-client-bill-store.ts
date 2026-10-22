import { Prisma } from "@repo/construction-db";

import {
  calendarDateFromDb,
  calendarDateToDb,
} from "@/src/shared-kernel/calendar-date";
import { userNamesInCompany } from "@/src/shared-kernel/user-names";

import type {
  ClientBillMeasurementRow,
  ClientBillStore,
  StoredClientBill,
  StoredClientBillLine,
  StoredClientContract,
} from "../application/client-bill-ports";
import type { ContractsTx } from "../application/ports";
import { quantityText } from "../domain/boq";
import {
  clientBillNumberTaken,
  clientBillOpenExists,
  type ClientContractTerms,
} from "../domain/client-bill";
import { fixedDecimal, PERCENT_SCALE } from "../domain/item-analysis";
import {
  billColumns,
  billCore,
  byDateSheetPosition,
  COUNTED_STATUSES,
  deductionRows,
  freeRows,
  MEASUREMENT_ROW_SELECT,
  measurementRowCore,
  pagedWhere,
  replaceDeductions,
  scaled,
  takeRows,
  tombstoneBill,
  uniqueRefusal,
  updateBill,
  type SelectedMeasurementRow,
} from "./prisma-ra-bill-rows";

type BillRow = Prisma.ConstructionContractsBillGetPayload<object>;
type LineRow = Prisma.ConstructionContractsBillLineGetPayload<object>;
type ContractRow = Prisma.ConstructionContractsClientContractGetPayload<object>;

const REFUSALS = {
  numberTaken: clientBillNumberTaken,
  openExists: clientBillOpenExists,
};

function toBill(row: BillRow): StoredClientBill {
  return {
    ...billCore(row),
    clientId: row.clientId ?? "",
    recipientGstin: row.recipientGstin,
  };
}

function toLine(row: LineRow): StoredClientBillLine {
  return {
    id: row.id,
    billId: row.billId,
    boqItemId: row.boqItemId ?? "",
    itemNo: row.itemNo,
    description: row.description,
    uomId: row.uomId,
    rate: row.rate,
    cumulativeQuantity: scaled(row.cumulativeQuantity),
    previousQuantity: scaled(row.previousQuantity),
    quantity: scaled(row.quantity),
    amount: row.amount,
    position: row.position,
  };
}

function toRow(row: SelectedMeasurementRow): ClientBillMeasurementRow {
  return { ...measurementRowCore(row), boqItemId: row.boqItemId ?? "" };
}

const percent = (value: { toString(): string } | null) =>
  value == null ? null : scaled(value, PERCENT_SCALE);

function toContract(row: ContractRow): StoredClientContract {
  return {
    id: row.id,
    projectId: row.projectId,
    terms: {
      retentionPercent: percent(row.retentionPercent) ?? 0n,
      retentionCapPercent: percent(row.retentionCapPercent),
      retentionCompletionPercent: percent(row.retentionCompletionPercent) ?? 0n,
      dlpMonths: row.dlpMonths,
      handoverOn:
        row.handoverOn == null ? null : calendarDateFromDb(row.handoverOn),
      sacCode: row.sacCode,
      gstRate: percent(row.gstRate),
    },
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
  };
}

function contractColumns(terms: ClientContractTerms) {
  const text = (value: bigint) => fixedDecimal(value, PERCENT_SCALE);
  return {
    retentionPercent: text(terms.retentionPercent),
    retentionCapPercent:
      terms.retentionCapPercent == null
        ? null
        : text(terms.retentionCapPercent),
    retentionCompletionPercent: text(terms.retentionCompletionPercent),
    dlpMonths: terms.dlpMonths,
    handoverOn:
      terms.handoverOn == null ? null : calendarDateToDb(terms.handoverOn),
    sacCode: terms.sacCode,
    gstRate: terms.gstRate == null ? null : text(terms.gstRate),
  };
}

const RUNNING_CLIENT = { side: "client", type: "running" } as const;

/**
 * Client Bills in `construction_contracts.bills` (CM-1107): running bills
 * on the client side, their lines naming BOQ items, the client-side
 * measurement rows they take, and the client contract's terms. Every
 * method runs on the transaction or client it is given. The lock is the
 * BOQ's (`PrismaBoqStore.lock`).
 */
export class PrismaClientBillStore implements ClientBillStore {
  private filterWhere(
    filter: Parameters<ClientBillStore["totals"]>[1],
  ): Prisma.ConstructionContractsBillWhereInput {
    return {
      workspaceId: filter.workspaceId,
      projectId: filter.projectId,
      ...RUNNING_CLIENT,
      deletedAt: null,
      ...(filter.status == null ? {} : { status: filter.status }),
      ...(filter.from == null && filter.to == null
        ? {}
        : {
            billDate: {
              ...(filter.from == null
                ? {}
                : { gte: calendarDateToDb(filter.from) }),
              ...(filter.to == null
                ? {}
                : { lte: calendarDateToDb(filter.to) }),
            },
          }),
    };
  }

  async list(db: ContractsTx, params: Parameters<ClientBillStore["list"]>[1]) {
    const base = this.filterWhere(params);
    const { where, direction, backwards } = pagedWhere(base, params);
    const [rows, total] = await Promise.all([
      db.constructionContractsBill.findMany({
        where,
        orderBy: [{ createdAt: direction }, { id: direction }],
        take: params.limit + 1,
      }),
      db.constructionContractsBill.count({ where: base }),
    ]);
    const hasMore = rows.length > params.limit;
    const page = rows.slice(0, params.limit);
    if (backwards) page.reverse();
    return { items: page.map(toBill), total, hasMore };
  }

  async totals(
    db: ContractsTx,
    filter: Parameters<ClientBillStore["totals"]>[1],
  ) {
    const found = await db.constructionContractsBill.aggregate({
      where: {
        AND: [
          this.filterWhere(filter),
          { status: { in: [...COUNTED_STATUSES] } },
        ],
      },
      _count: { _all: true },
      _sum: {
        gross: true,
        cgst: true,
        sgst: true,
        igst: true,
        deductionsTotal: true,
        net: true,
      },
    });
    const sum = found._sum;
    return {
      count: found._count._all,
      gross: sum.gross ?? 0n,
      gst: (sum.cgst ?? 0n) + (sum.sgst ?? 0n) + (sum.igst ?? 0n),
      deductions: sum.deductionsTotal ?? 0n,
      net: sum.net ?? 0n,
    };
  }

  async find(db: ContractsTx, workspaceId: string, id: string) {
    const row = await db.constructionContractsBill.findFirst({
      where: { id, workspaceId, ...RUNNING_CLIENT, deletedAt: null },
    });
    return row == null ? null : toBill(row);
  }

  async lines(
    db: ContractsTx,
    workspaceId: string,
    billIds: readonly string[],
  ) {
    if (billIds.length === 0) return [];
    const rows = await db.constructionContractsBillLine.findMany({
      where: { workspaceId, billId: { in: [...new Set(billIds)] } },
      orderBy: [{ billId: "asc" }, { position: "asc" }, { id: "asc" }],
    });
    return rows.map(toLine);
  }

  deductions(db: ContractsTx, workspaceId: string, billIds: readonly string[]) {
    return deductionRows(db, workspaceId, billIds);
  }

  async insert(tx: ContractsTx, bill: StoredClientBill) {
    try {
      await tx.constructionContractsBill.create({
        data: {
          id: bill.id,
          workspaceId: bill.workspaceId,
          projectId: bill.projectId,
          ...RUNNING_CLIENT,
          clientId: bill.clientId,
          recipientGstin: bill.recipientGstin,
          ...billColumns(bill),
          createdAt: bill.createdAt,
          createdBy: bill.createdBy,
        },
      });
    } catch (error) {
      throw uniqueRefusal(error, REFUSALS) ?? error;
    }
  }

  update(tx: ContractsTx, after: StoredClientBill, expectedUpdatedAt: Date) {
    return updateBill(
      tx,
      after,
      expectedUpdatedAt,
      { clientId: after.clientId, recipientGstin: after.recipientGstin },
      REFUSALS,
    );
  }

  async replaceLines(
    tx: ContractsTx,
    workspaceId: string,
    billId: string,
    lines: readonly StoredClientBillLine[],
  ) {
    await tx.constructionContractsBillLine.deleteMany({
      where: { workspaceId, billId },
    });
    if (lines.length === 0) return;
    await tx.constructionContractsBillLine.createMany({
      data: lines.map((line) => ({
        id: line.id,
        workspaceId,
        billId,
        boqItemId: line.boqItemId,
        itemNo: line.itemNo,
        description: line.description,
        uomId: line.uomId,
        rate: line.rate,
        cumulativeQuantity: quantityText(line.cumulativeQuantity),
        previousQuantity: quantityText(line.previousQuantity),
        quantity: quantityText(line.quantity),
        amount: line.amount,
        position: line.position,
      })),
    });
  }

  replaceDeductions(
    tx: ContractsTx,
    workspaceId: string,
    billId: string,
    deductions: Parameters<ClientBillStore["replaceDeductions"]>[3],
  ) {
    return replaceDeductions(tx, workspaceId, billId, deductions);
  }

  delete(tx: ContractsTx, input: Parameters<ClientBillStore["delete"]>[1]) {
    return tombstoneBill(tx, input);
  }

  async billableRows(
    db: ContractsTx,
    input: Parameters<ClientBillStore["billableRows"]>[1],
  ) {
    const rows = await db.constructionContractsMeasurementRow.findMany({
      where: {
        workspaceId: input.workspaceId,
        billId: null,
        boqItemId: { not: null },
        sheet: {
          workspaceId: input.workspaceId,
          projectId: input.projectId,
          side: "client",
          status: "checked",
          deletedAt: null,
          measuredOn: { lte: calendarDateToDb(input.measuredUpTo) },
        },
      },
      select: MEASUREMENT_ROW_SELECT,
    });
    return rows.map(toRow).sort(byDateSheetPosition);
  }

  async unbilledDays(db: ContractsTx, workspaceId: string, projectId: string) {
    const rows = await db.$queryRaw<{ measuredOn: Date; rows: number }[]>(
      Prisma.sql`SELECT s.measured_on AS "measuredOn", COUNT(*)::int AS rows
        FROM construction_contracts.measurement_rows r
        JOIN construction_contracts.measurement_sheets s ON s.id = r.sheet_id
        WHERE r.workspace_id = ${workspaceId} AND s.workspace_id = ${workspaceId}
          AND s.project_id = ${projectId}::uuid
          AND s.side = 'client' AND s.status = 'checked' AND s.deleted_at IS NULL
          AND r.bill_id IS NULL AND r.boq_item_id IS NOT NULL
        GROUP BY s.measured_on
        ORDER BY s.measured_on`,
    );
    return rows.map((row) => ({
      measuredOn: calendarDateFromDb(row.measuredOn),
      rows: row.rows,
    }));
  }

  async rowsOfBill(db: ContractsTx, workspaceId: string, billId: string) {
    const rows = await db.constructionContractsMeasurementRow.findMany({
      where: { workspaceId, billId },
      select: MEASUREMENT_ROW_SELECT,
    });
    return rows.map(toRow).sort(byDateSheetPosition);
  }

  takeRows(
    tx: ContractsTx,
    workspaceId: string,
    billId: string,
    rowIds: readonly string[],
  ) {
    return takeRows(tx, workspaceId, billId, rowIds);
  }

  freeRows(tx: ContractsTx, workspaceId: string, billId: string) {
    return freeRows(tx, workspaceId, billId);
  }

  async billedByItem(db: ContractsTx, workspaceId: string, projectId: string) {
    const rows = await db.$queryRaw<{ boqItemId: string; quantity: string }[]>(
      Prisma.sql`SELECT l.boq_item_id::text AS "boqItemId",
          SUM(l.quantity)::text AS quantity
        FROM construction_contracts.bill_lines l
        JOIN construction_contracts.bills b ON b.id = l.bill_id
        WHERE l.workspace_id = ${workspaceId} AND b.workspace_id = ${workspaceId}
          AND b.project_id = ${projectId}::uuid
          AND b.side = 'client' AND b.type = 'running'
          AND b.deleted_at IS NULL AND b.status = 'approved'
          AND l.boq_item_id IS NOT NULL
        GROUP BY l.boq_item_id`,
    );
    return new Map(rows.map((row) => [row.boqItemId, scaled(row.quantity)]));
  }

  async retentionHeld(
    db: ContractsTx,
    workspaceId: string,
    projectId: string,
    exceptBillId: string | null,
  ) {
    const rows = await db.$queryRaw<{ amount: bigint }[]>(
      Prisma.sql`SELECT COALESCE(SUM(d.amount), 0)::bigint AS amount
        FROM construction_contracts.bill_deductions d
        JOIN construction_contracts.bills b ON b.id = d.bill_id
        WHERE d.workspace_id = ${workspaceId} AND b.workspace_id = ${workspaceId}
          AND b.project_id = ${projectId}::uuid
          AND b.side = 'client'
          AND b.deleted_at IS NULL AND b.status = 'approved'
          AND d.kind = 'retention'
          ${exceptBillId == null ? Prisma.empty : Prisma.sql`AND b.id <> ${exceptBillId}::uuid`}`,
    );
    return rows[0]?.amount ?? 0n;
  }

  async maxOrdinal(db: ContractsTx, workspaceId: string, projectId: string) {
    const found = await db.constructionContractsBill.aggregate({
      where: {
        workspaceId,
        projectId,
        ...RUNNING_CLIENT,
        deletedAt: null,
        status: { notIn: ["rejected", "reversed"] },
      },
      _max: { ordinal: true },
    });
    return found._max.ordinal ?? 0;
  }

  async laterBills(
    db: ContractsTx,
    workspaceId: string,
    bill: Parameters<ClientBillStore["laterBills"]>[2],
  ) {
    return db.constructionContractsBill.count({
      where: {
        workspaceId,
        projectId: bill.projectId,
        ...RUNNING_CLIENT,
        deletedAt: null,
        id: { not: bill.id },
        OR: [
          { status: { in: ["draft", "pending_approval"] } },
          { status: "approved", ordinal: { gt: bill.ordinal ?? 0 } },
        ],
      },
    });
  }

  async openBillId(db: ContractsTx, workspaceId: string, projectId: string) {
    const row = await db.constructionContractsBill.findFirst({
      where: {
        workspaceId,
        projectId,
        ...RUNNING_CLIENT,
        deletedAt: null,
        status: { in: ["draft", "pending_approval"] },
      },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  async contract(db: ContractsTx, workspaceId: string, projectId: string) {
    const row = await db.constructionContractsClientContract.findFirst({
      where: { workspaceId, projectId },
    });
    return row == null ? null : toContract(row);
  }

  async saveContract(
    tx: ContractsTx,
    input: Parameters<ClientBillStore["saveContract"]>[1],
  ) {
    const columns = contractColumns(input.terms);
    if (input.expectedUpdatedAt == null) {
      await tx.constructionContractsClientContract.create({
        data: {
          id: input.id,
          workspaceId: input.workspaceId,
          projectId: input.projectId,
          ...columns,
          createdAt: input.at,
          updatedAt: input.at,
          createdBy: input.by,
          updatedBy: input.by,
        },
      });
      return true;
    }
    const result = await tx.constructionContractsClientContract.updateMany({
      where: {
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        updatedAt: input.expectedUpdatedAt,
      },
      data: { ...columns, updatedAt: input.at, updatedBy: input.by },
    });
    return result.count === 1;
  }

  names(db: ContractsTx, workspaceId: string, userIds: readonly string[]) {
    return userNamesInCompany(db, workspaceId, userIds);
  }
}
