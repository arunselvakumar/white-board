import { Prisma } from "@repo/construction-db";

import {
  calendarDateFromDb,
  calendarDateToDb,
} from "@/src/shared-kernel/calendar-date";
import { storedLocationRef } from "@/src/shared-kernel/location-ref";
import { isUniqueViolation } from "@/src/shared-kernel/prisma-errors";
import { userNamesInCompany } from "@/src/shared-kernel/user-names";

import type {
  BillMeasurementRow,
  ContractorBillStore,
  StoredBill,
  StoredBillDeduction,
  StoredBillLine,
  UnbilledDay,
} from "../application/contractor-bill-ports";
import type { ContractsTx } from "../application/ports";
import { BOQ_QUANTITY_SCALE, quantityText } from "../domain/boq";
import { billNumberTaken, billOpenExists } from "../domain/contractor-bill";
import {
  fixedDecimal,
  PERCENT_SCALE,
  scaledDecimal,
} from "../domain/item-analysis";

type BillRow = Prisma.ConstructionContractsBillGetPayload<object>;
type LineRow = Prisma.ConstructionContractsBillLineGetPayload<object>;
type DeductionRow = Prisma.ConstructionContractsBillDeductionGetPayload<object>;

type DecimalLike = { toString(): string };

function scaled(value: DecimalLike, scale = BOQ_QUANTITY_SCALE): bigint {
  return scaledDecimal(value.toString(), scale) ?? 0n;
}

function optionalScaled(value: DecimalLike | null): bigint | null {
  return value == null ? null : scaled(value);
}

function toBill(row: BillRow): StoredBill {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    workOrderId: row.workOrderId ?? "",
    number: row.number,
    ordinal: row.ordinal,
    billDate: calendarDateFromDb(row.billDate),
    measuredUpTo: calendarDateFromDb(row.measuredUpTo ?? row.billDate),
    isFinal: row.isFinal,
    status: row.status,
    cumulativeValue: row.cumulativeValue,
    previousValue: row.previousValue,
    gross: row.gross,
    sacCode: row.sacCode,
    gstRate: row.gstRate == null ? null : scaled(row.gstRate, PERCENT_SCALE),
    placeOfSupplyStateCode: row.placeOfSupplyStateCode,
    supplierGstin: row.supplierGstin,
    reverseCharge: row.reverseCharge,
    cgst: row.cgst,
    sgst: row.sgst,
    igst: row.igst,
    deductionsTotal: row.deductionsTotal,
    net: row.net,
    remarks: row.remarks,
    invoiceId: row.invoiceId,
    submittedAt: row.submittedAt,
    submittedBy: row.submittedBy,
    decidedAt: row.decidedAt,
    decidedBy: row.decidedBy,
    rejectReason: row.rejectReason,
    reversedAt: row.reversedAt,
    reversedBy: row.reversedBy,
    reverseReason: row.reverseReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

function toLine(row: LineRow): StoredBillLine {
  return {
    id: row.id,
    billId: row.billId,
    workOrderLineId: row.workOrderLineId ?? "",
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

function toDeduction(row: DeductionRow): StoredBillDeduction {
  return {
    id: row.id,
    billId: row.billId,
    kind: row.kind,
    description: row.description,
    amount: row.amount,
    advanceId: row.advanceId,
    position: row.position,
  };
}

/** The columns a bill's figures and life write. */
function billData(bill: StoredBill) {
  return {
    number: bill.number,
    ordinal: bill.ordinal,
    billDate: calendarDateToDb(bill.billDate),
    measuredUpTo: calendarDateToDb(bill.measuredUpTo),
    isFinal: bill.isFinal,
    status: bill.status,
    cumulativeValue: bill.cumulativeValue,
    previousValue: bill.previousValue,
    gross: bill.gross,
    sacCode: bill.sacCode,
    gstRate:
      bill.gstRate == null ? null : fixedDecimal(bill.gstRate, PERCENT_SCALE),
    placeOfSupplyStateCode: bill.placeOfSupplyStateCode,
    supplierGstin: bill.supplierGstin,
    reverseCharge: bill.reverseCharge,
    cgst: bill.cgst,
    sgst: bill.sgst,
    igst: bill.igst,
    deductionsTotal: bill.deductionsTotal,
    net: bill.net,
    remarks: bill.remarks,
    invoiceId: bill.invoiceId,
    submittedAt: bill.submittedAt,
    submittedBy: bill.submittedBy,
    decidedAt: bill.decidedAt,
    decidedBy: bill.decidedBy,
    rejectReason: bill.rejectReason,
    reversedAt: bill.reversedAt,
    reversedBy: bill.reversedBy,
    reverseReason: bill.reverseReason,
    updatedAt: bill.updatedAt,
    updatedBy: bill.updatedBy,
  };
}

/** The partial unique indexes on `bills` say which rule refused the write. */
function uniqueRefusal(error: unknown): Error | null {
  if (!isUniqueViolation(error)) return null;
  const target = JSON.stringify(error.meta ?? {});
  return target.includes("number") ? billNumberTaken() : billOpenExists();
}

const COUNTS = ["draft", "pending_approval", "approved"] as const;

const ROW_SELECT = {
  id: true,
  sheetId: true,
  workOrderLineId: true,
  description: true,
  location: true,
  nos: true,
  length: true,
  breadth: true,
  depth: true,
  direct: true,
  quantity: true,
  position: true,
  sheet: { select: { measuredOn: true, title: true } },
} as const;

type SelectedRow = Prisma.ConstructionContractsMeasurementRowGetPayload<{
  select: typeof ROW_SELECT;
}>;

function toMeasurementRow(row: SelectedRow): BillMeasurementRow {
  return {
    id: row.id,
    sheetId: row.sheetId,
    measuredOn: calendarDateFromDb(row.sheet.measuredOn),
    sheetTitle: row.sheet.title,
    workOrderLineId: row.workOrderLineId ?? "",
    description: row.description,
    location: storedLocationRef(row.location),
    nos: optionalScaled(row.nos),
    length: optionalScaled(row.length),
    breadth: optionalScaled(row.breadth),
    depth: optionalScaled(row.depth),
    direct: row.direct,
    quantity: scaled(row.quantity),
    position: row.position,
  };
}

function byDateSheetPosition(a: BillMeasurementRow, b: BillMeasurementRow) {
  return (
    a.measuredOn.localeCompare(b.measuredOn) ||
    a.sheetId.localeCompare(b.sheetId) ||
    a.position - b.position
  );
}

/**
 * Contractor Bills, their lines and deductions in `construction_contracts`
 * (CM-1106), and the measurement rows they take. Every method runs on the
 * transaction or client it is given. The lock is the BOQ's
 * (`PrismaBoqStore.lock`).
 */
export class PrismaContractorBillStore implements ContractorBillStore {
  private async filterWhere(
    db: ContractsTx,
    filter: Parameters<ContractorBillStore["totals"]>[1],
  ): Promise<Prisma.ConstructionContractsBillWhereInput> {
    let workOrderIds: string[] | null = null;
    if (filter.contractorId != null) {
      const rows = await db.constructionContractsWorkOrder.findMany({
        where: {
          workspaceId: filter.workspaceId,
          projectId: filter.projectId,
          contractorId: filter.contractorId,
        },
        select: { id: true },
      });
      workOrderIds = rows.map((row) => row.id);
    }
    const workOrderFilter =
      filter.workOrderId != null
        ? workOrderIds == null || workOrderIds.includes(filter.workOrderId)
          ? { workOrderId: filter.workOrderId }
          : { workOrderId: { in: [] } }
        : workOrderIds == null
          ? {}
          : { workOrderId: { in: workOrderIds } };
    return {
      workspaceId: filter.workspaceId,
      projectId: filter.projectId,
      side: "contractor",
      type: "running",
      deletedAt: null,
      ...(filter.status == null ? {} : { status: filter.status }),
      ...workOrderFilter,
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

  async list(
    db: ContractsTx,
    params: Parameters<ContractorBillStore["list"]>[1],
  ) {
    const base = await this.filterWhere(db, params);
    const backwards = params.before != null;
    const cursor = params.after ?? params.before;
    const paged: Prisma.ConstructionContractsBillWhereInput[] =
      cursor == null
        ? [base]
        : [
            base,
            {
              OR: backwards
                ? [
                    { createdAt: { gt: cursor.createdAt } },
                    { createdAt: cursor.createdAt, id: { gt: cursor.id } },
                  ]
                : [
                    { createdAt: { lt: cursor.createdAt } },
                    { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                  ],
            },
          ];
    const direction = backwards ? ("asc" as const) : ("desc" as const);
    const [rows, total] = await Promise.all([
      db.constructionContractsBill.findMany({
        where: { AND: paged },
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
    filter: Parameters<ContractorBillStore["totals"]>[1],
  ) {
    const base = await this.filterWhere(db, filter);
    const found = await db.constructionContractsBill.aggregate({
      where: {
        AND: [base, { status: { in: [...COUNTS] } }],
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
      where: {
        id,
        workspaceId,
        side: "contractor",
        type: "running",
        deletedAt: null,
      },
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

  async deductions(
    db: ContractsTx,
    workspaceId: string,
    billIds: readonly string[],
  ) {
    if (billIds.length === 0) return [];
    const rows = await db.constructionContractsBillDeduction.findMany({
      where: { workspaceId, billId: { in: [...new Set(billIds)] } },
      orderBy: [{ billId: "asc" }, { position: "asc" }, { id: "asc" }],
    });
    return rows.map(toDeduction);
  }

  async insert(tx: ContractsTx, bill: StoredBill) {
    try {
      await tx.constructionContractsBill.create({
        data: {
          id: bill.id,
          workspaceId: bill.workspaceId,
          projectId: bill.projectId,
          side: "contractor",
          type: "running",
          workOrderId: bill.workOrderId,
          ...billData(bill),
          createdAt: bill.createdAt,
          createdBy: bill.createdBy,
        },
      });
    } catch (error) {
      throw uniqueRefusal(error) ?? error;
    }
  }

  async update(tx: ContractsTx, after: StoredBill, expectedUpdatedAt: Date) {
    try {
      const result = await tx.constructionContractsBill.updateMany({
        where: {
          id: after.id,
          workspaceId: after.workspaceId,
          deletedAt: null,
          updatedAt: expectedUpdatedAt,
        },
        data: billData(after),
      });
      return result.count === 1;
    } catch (error) {
      throw uniqueRefusal(error) ?? error;
    }
  }

  async replaceLines(
    tx: ContractsTx,
    workspaceId: string,
    billId: string,
    lines: readonly StoredBillLine[],
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
        workOrderLineId: line.workOrderLineId,
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

  async replaceDeductions(
    tx: ContractsTx,
    workspaceId: string,
    billId: string,
    deductions: readonly StoredBillDeduction[],
  ) {
    await tx.constructionContractsBillDeduction.deleteMany({
      where: { workspaceId, billId },
    });
    if (deductions.length === 0) return;
    await tx.constructionContractsBillDeduction.createMany({
      data: deductions.map((deduction) => ({
        id: deduction.id,
        workspaceId,
        billId,
        kind: deduction.kind,
        description: deduction.description,
        amount: deduction.amount,
        advanceId: deduction.advanceId,
        position: deduction.position,
      })),
    });
  }

  async delete(
    tx: ContractsTx,
    input: Parameters<ContractorBillStore["delete"]>[1],
  ) {
    const result = await tx.constructionContractsBill.updateMany({
      where: {
        id: input.bill.id,
        workspaceId: input.bill.workspaceId,
        deletedAt: null,
        ...(input.expectedUpdatedAt == null
          ? {}
          : { updatedAt: input.expectedUpdatedAt }),
      },
      data: {
        deletedAt: input.at,
        deletedBy: input.by,
        updatedAt: input.at,
        updatedBy: input.by,
      },
    });
    return result.count === 1;
  }

  async billableRows(
    db: ContractsTx,
    input: Parameters<ContractorBillStore["billableRows"]>[1],
  ) {
    const rows = await db.constructionContractsMeasurementRow.findMany({
      where: {
        workspaceId: input.workspaceId,
        billId: null,
        workOrderLineId: { not: null },
        sheet: {
          workspaceId: input.workspaceId,
          workOrderId: input.workOrderId,
          side: "contractor",
          status: "checked",
          deletedAt: null,
          measuredOn: { lte: calendarDateToDb(input.measuredUpTo) },
        },
      },
      select: ROW_SELECT,
    });
    return rows.map(toMeasurementRow).sort(byDateSheetPosition);
  }

  async unbilledDays(
    db: ContractsTx,
    workspaceId: string,
    workOrderIds: readonly string[],
  ) {
    const out = new Map<string, UnbilledDay[]>();
    if (workOrderIds.length === 0) return out;
    const rows = await db.$queryRaw<
      { workOrderId: string; measuredOn: Date; rows: number }[]
    >(
      Prisma.sql`SELECT s.work_order_id::text AS "workOrderId", s.measured_on AS "measuredOn",
          COUNT(*)::int AS rows
        FROM construction_contracts.measurement_rows r
        JOIN construction_contracts.measurement_sheets s ON s.id = r.sheet_id
        WHERE r.workspace_id = ${workspaceId} AND s.workspace_id = ${workspaceId}
          AND s.work_order_id = ANY(${[...new Set(workOrderIds)]}::uuid[])
          AND s.side = 'contractor' AND s.status = 'checked' AND s.deleted_at IS NULL
          AND r.bill_id IS NULL AND r.work_order_line_id IS NOT NULL
        GROUP BY s.work_order_id, s.measured_on
        ORDER BY s.measured_on`,
    );
    for (const row of rows) {
      const days = out.get(row.workOrderId) ?? [];
      days.push({
        measuredOn: calendarDateFromDb(row.measuredOn),
        rows: row.rows,
      });
      out.set(row.workOrderId, days);
    }
    return out;
  }

  async rowsOfBill(db: ContractsTx, workspaceId: string, billId: string) {
    const rows = await db.constructionContractsMeasurementRow.findMany({
      where: { workspaceId, billId },
      select: ROW_SELECT,
    });
    return rows.map(toMeasurementRow).sort(byDateSheetPosition);
  }

  async takeRows(
    tx: ContractsTx,
    workspaceId: string,
    billId: string,
    rowIds: readonly string[],
  ) {
    if (rowIds.length === 0) return;
    await tx.constructionContractsMeasurementRow.updateMany({
      where: { workspaceId, id: { in: [...rowIds] }, billId: null },
      data: { billId },
    });
  }

  async freeRows(tx: ContractsTx, workspaceId: string, billId: string) {
    const result = await tx.constructionContractsMeasurementRow.updateMany({
      where: { workspaceId, billId },
      data: { billId: null },
    });
    return result.count;
  }

  async retentionHeld(
    db: ContractsTx,
    workspaceId: string,
    workOrderId: string,
    exceptBillId: string | null,
  ) {
    const rows = await db.$queryRaw<{ amount: bigint }[]>(
      Prisma.sql`SELECT COALESCE(SUM(d.amount), 0)::bigint AS amount
        FROM construction_contracts.bill_deductions d
        JOIN construction_contracts.bills b ON b.id = d.bill_id
        WHERE d.workspace_id = ${workspaceId} AND b.workspace_id = ${workspaceId}
          AND b.work_order_id = ${workOrderId}::uuid
          AND b.deleted_at IS NULL AND b.status = 'approved'
          AND d.kind = 'retention'
          ${exceptBillId == null ? Prisma.empty : Prisma.sql`AND b.id <> ${exceptBillId}::uuid`}`,
    );
    return rows[0]?.amount ?? 0n;
  }

  async retentionHeldByContractor(
    db: ContractsTx,
    workspaceId: string,
    projectId: string,
  ) {
    const rows = await db.$queryRaw<{ contractorId: string; amount: bigint }[]>(
      Prisma.sql`SELECT w.contractor_id::text AS "contractorId",
          COALESCE(SUM(d.amount), 0)::bigint AS amount
        FROM construction_contracts.bill_deductions d
        JOIN construction_contracts.bills b ON b.id = d.bill_id
        JOIN construction_contracts.work_orders w ON w.id = b.work_order_id
        WHERE d.workspace_id = ${workspaceId} AND b.workspace_id = ${workspaceId}
          AND b.project_id = ${projectId}::uuid
          AND b.side = 'contractor' AND b.deleted_at IS NULL AND b.status = 'approved'
          AND d.kind = 'retention'
        GROUP BY w.contractor_id`,
    );
    return new Map(rows.map((row) => [row.contractorId, row.amount]));
  }

  async maxOrdinal(db: ContractsTx, workspaceId: string, workOrderId: string) {
    const found = await db.constructionContractsBill.aggregate({
      where: {
        workspaceId,
        workOrderId,
        type: "running",
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
    bill: Parameters<ContractorBillStore["laterBills"]>[2],
  ) {
    return db.constructionContractsBill.count({
      where: {
        workspaceId,
        workOrderId: bill.workOrderId,
        type: "running",
        deletedAt: null,
        id: { not: bill.id },
        OR: [
          { status: { in: ["draft", "pending_approval"] } },
          { status: "approved", ordinal: { gt: bill.ordinal ?? 0 } },
        ],
      },
    });
  }

  async countsByWorkOrder(
    db: ContractsTx,
    workspaceId: string,
    workOrderIds: readonly string[],
  ) {
    if (workOrderIds.length === 0) return new Map<string, number>();
    const rows = await db.constructionContractsBill.groupBy({
      by: ["workOrderId"],
      where: {
        workspaceId,
        workOrderId: { in: [...new Set(workOrderIds)] },
        type: "running",
        deletedAt: null,
        status: { in: [...COUNTS] },
      },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.workOrderId ?? "", row._count._all]));
  }

  names(db: ContractsTx, workspaceId: string, userIds: readonly string[]) {
    return userNamesInCompany(db, workspaceId, userIds);
  }
}
