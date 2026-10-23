import type { Prisma } from "@repo/construction-db";

import {
  calendarDateFromDb,
  calendarDateToDb,
} from "@/src/shared-kernel/calendar-date";
import { storedLocationRef } from "@/src/shared-kernel/location-ref";
import { isUniqueViolation } from "@/src/shared-kernel/prisma-errors";

import type {
  BillMeasurementRow,
  StoredBill,
  StoredBillDeduction,
} from "../application/contractor-bill-ports";
import type { ContractsTx } from "../application/ports";
import { BOQ_QUANTITY_SCALE } from "../domain/boq";
import {
  fixedDecimal,
  PERCENT_SCALE,
  scaledDecimal,
} from "../domain/item-analysis";

/**
 * What the Contractor Bill and Client Bill stores share (CM-1106, CM-1107):
 * one `bills` table with its lines and deductions, and the measurement
 * rows a bill takes. The side-specific parts (the line's key, the party,
 * the filters) stay in each store.
 */

type BillRow = Prisma.ConstructionContractsBillGetPayload<object>;
type DeductionRow = Prisma.ConstructionContractsBillDeductionGetPayload<object>;

type DecimalLike = { toString(): string };

export function scaled(value: DecimalLike, scale = BOQ_QUANTITY_SCALE): bigint {
  return scaledDecimal(value.toString(), scale) ?? 0n;
}

export function optionalScaled(value: DecimalLike | null): bigint | null {
  return value == null ? null : scaled(value);
}

/** The columns every bill has, read. */
export function billCore(row: BillRow): Omit<StoredBill, "workOrderId"> {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    number: row.number,
    ordinal: row.ordinal,
    type: row.type,
    periodFrom:
      row.periodFrom == null ? null : calendarDateFromDb(row.periodFrom),
    periodTo: row.periodTo == null ? null : calendarDateFromDb(row.periodTo),
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

/** The columns a bill's figures and life write. */
export function billColumns(bill: Omit<StoredBill, "workOrderId">) {
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

export function toDeduction(row: DeductionRow): StoredBillDeduction {
  return {
    id: row.id,
    billId: row.billId,
    kind: row.kind,
    description: row.description,
    amount: row.amount,
    advanceId: row.advanceId,
    escalationBillId: row.escalationBillId,
    materialId: row.materialId,
    position: row.position,
  };
}

/** The partial unique indexes on `bills` say which rule refused the write. */
export function uniqueRefusal(
  error: unknown,
  refusals: { numberTaken: () => Error; openExists: () => Error },
): Error | null {
  if (!isUniqueViolation(error)) return null;
  const target = JSON.stringify(error.meta ?? {});
  return target.includes("number")
    ? refusals.numberTaken()
    : refusals.openExists();
}

/** The statuses that count in totals and lists of live bills. */
export const COUNTED_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
] as const;

export async function updateBill(
  tx: ContractsTx,
  after: Omit<StoredBill, "workOrderId">,
  expectedUpdatedAt: Date,
  extra: Prisma.ConstructionContractsBillUpdateManyMutationInput,
  refusals: Parameters<typeof uniqueRefusal>[1],
): Promise<boolean> {
  try {
    const result = await tx.constructionContractsBill.updateMany({
      where: {
        id: after.id,
        workspaceId: after.workspaceId,
        deletedAt: null,
        updatedAt: expectedUpdatedAt,
      },
      data: { ...billColumns(after), ...extra },
    });
    return result.count === 1;
  } catch (error) {
    throw uniqueRefusal(error, refusals) ?? error;
  }
}

export async function deductionRows(
  db: ContractsTx,
  workspaceId: string,
  billIds: readonly string[],
): Promise<StoredBillDeduction[]> {
  if (billIds.length === 0) return [];
  const rows = await db.constructionContractsBillDeduction.findMany({
    where: { workspaceId, billId: { in: [...new Set(billIds)] } },
    orderBy: [{ billId: "asc" }, { position: "asc" }, { id: "asc" }],
  });
  return rows.map(toDeduction);
}

export async function replaceDeductions(
  tx: ContractsTx,
  workspaceId: string,
  billId: string,
  deductions: readonly StoredBillDeduction[],
): Promise<void> {
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
      escalationBillId: deduction.escalationBillId,
      materialId: deduction.materialId,
      position: deduction.position,
    })),
  });
}

/** A tombstone; false when `updatedAt` is not `expectedUpdatedAt` (when given). */
export async function tombstoneBill(
  tx: ContractsTx,
  input: {
    bill: { id: string; workspaceId: string };
    expectedUpdatedAt: Date | null;
    by: string;
    at: Date;
  },
): Promise<boolean> {
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

export async function takeRows(
  tx: ContractsTx,
  workspaceId: string,
  billId: string,
  rowIds: readonly string[],
): Promise<void> {
  if (rowIds.length === 0) return;
  await tx.constructionContractsMeasurementRow.updateMany({
    where: { workspaceId, id: { in: [...rowIds] }, billId: null },
    data: { billId },
  });
}

/** Clears `bill_id` on every row the bill took; returns how many. */
export async function freeRows(
  tx: ContractsTx,
  workspaceId: string,
  billId: string,
): Promise<number> {
  const result = await tx.constructionContractsMeasurementRow.updateMany({
    where: { workspaceId, billId },
    data: { billId: null },
  });
  return result.count;
}

export const MEASUREMENT_ROW_SELECT = {
  id: true,
  sheetId: true,
  boqItemId: true,
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

export type SelectedMeasurementRow =
  Prisma.ConstructionContractsMeasurementRowGetPayload<{
    select: typeof MEASUREMENT_ROW_SELECT;
  }>;

/** A measurement row as a bill shows it, without its line key. */
export function measurementRowCore(
  row: SelectedMeasurementRow,
): Omit<BillMeasurementRow, "workOrderLineId"> {
  return {
    id: row.id,
    sheetId: row.sheetId,
    measuredOn: calendarDateFromDb(row.sheet.measuredOn),
    sheetTitle: row.sheet.title,
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

export function byDateSheetPosition(
  a: Pick<BillMeasurementRow, "measuredOn" | "sheetId" | "position">,
  b: Pick<BillMeasurementRow, "measuredOn" | "sheetId" | "position">,
): number {
  return (
    a.measuredOn.localeCompare(b.measuredOn) ||
    a.sheetId.localeCompare(b.sheetId) ||
    a.position - b.position
  );
}

/** Cursor paging on `(created_at, id)`, newest first (root ADR-0020). */
export function pagedWhere(
  base: Prisma.ConstructionContractsBillWhereInput,
  page: {
    after?: { createdAt: Date; id: string };
    before?: { createdAt: Date; id: string };
  },
): {
  where: Prisma.ConstructionContractsBillWhereInput;
  direction: "asc" | "desc";
  backwards: boolean;
} {
  const backwards = page.before != null;
  const cursor = page.after ?? page.before;
  return {
    where:
      cursor == null
        ? base
        : {
            AND: [
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
            ],
          },
    direction: backwards ? "asc" : "desc",
    backwards,
  };
}
