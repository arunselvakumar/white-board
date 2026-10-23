import type { DocumentNaming } from "@/src/shared-kernel/approval";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import {
  conflict,
  DomainError,
  notFound,
} from "@/src/shared-kernel/domain-error";

import { quantityText } from "./boq";
import type { DeductionKind } from "./contract-terms";
import { trimmed } from "./measurement";
import {
  assertRaDeductions,
  lineFigures,
  raBillDeductions,
  raBillHeader,
  raRetentionSuggestion,
  type BillDeductionInput,
  type BillHeader,
  type BillHeaderInput,
  type LineFigures,
  type RaBillDeduction,
  type RetentionSuggestion,
} from "./ra-bill";

// The engine both sides share (CM-1107 moved it to `ra-bill.ts`).
export {
  assertBillAction,
  BILL_DEDUCTION_DESCRIPTION_MAX,
  BILL_DEDUCTIONS_MAX,
  BILL_REMARKS_MAX,
  billActions,
  billChanged,
  billGrossNotPositive,
  billGst,
  billNet,
  billNotPending,
  billValues,
  deductionLabel,
  deductionsTotal,
  retentionTotal,
  reverseReason,
  rupees,
  type BillAction,
  type BillDeductionInput,
  type BillGst,
  type BillHeader,
  type BillHeaderInput,
  type BillValues,
  type RetentionSuggestion,
} from "./ra-bill";

/**
 * A Contractor Bill (CM-1106, ADR CM-0023 §7): an inward running-account
 * (RA) bill on one issued Work Order. It takes every **checked**
 * contractor-side measurement row of that Work Order measured up to its
 * date and not taken by another bill, and bills, per Work Order line:
 *
 * - this bill's quantity = Σ its rows;
 * - previous quantity = Σ the line's quantities on earlier **approved** bills;
 * - cumulative = previous + this (never above the Work Order line's
 *   quantity: 409 `WORK_ORDER_QUANTITY_EXCEEDED`);
 * - amount = round(cumulative × rate) − round(previous × rate), half up,
 *   at the Work Order line's rate when the bill was drafted or refreshed.
 *
 * Gross = Σ line amounts = cumulative value − previous value. GST comes
 * from the Work Order's terms; deductions (retention, mobilisation
 * advance recovery, material issued at cost, other) are typed; net =
 * gross + GST (none under reverse charge) − deductions.
 *
 * Life: **draft** (refresh, edit, delete) → submit (numbered) → **pending
 * approval** → approve → **approved** (a payable invoice in finance), or
 * reject → **rejected** (kept as a record). An approved bill can be
 * **reversed** while it is the latest on its Work Order and unsettled.
 * Deleting, rejecting and reversing free the bill's measurement rows.
 * Quantities are ten-thousandths, money paise, percentages hundredths.
 */

export const CONTRACTOR_BILL_NAMING: DocumentNaming = {
  code: "BILL",
  label: "Contractor Bill",
};

/**
 * The deductions a Contractor Bill takes: retention, mobilisation and
 * secured advance recoveries (each naming its advance, CM-1108), material
 * issued at cost, material reconciliation recovery (each naming its
 * Material, CM-1110) and other.
 */
export const CONTRACTOR_BILL_DEDUCTION_KINDS = [
  "retention",
  "mobilisation_recovery",
  "secured_advance_recovery",
  "material_at_cost",
  "material_reconciliation",
  "other",
] as const satisfies readonly DeductionKind[];
export type ContractorBillDeductionKind =
  (typeof CONTRACTOR_BILL_DEDUCTION_KINDS)[number];

function field(code: string, message: string, name: string): DomainError {
  return new DomainError(code, message, { details: { field: name } });
}

/**
 * The bill date is not after the Company's today and not before the Work
 * Order's date; "measured up to" is not after the bill date. Remarks are
 * at most 2,000 characters and keep their line breaks.
 */
export function billHeader(
  input: BillHeaderInput,
  context: { today: CalendarDate; orderDate: CalendarDate },
): BillHeader {
  return raBillHeader(input, {
    today: context.today,
    notBefore: {
      date: context.orderDate,
      code: "BILL_DATE_BEFORE_ORDER_DATE",
      message: "The bill date is on or after the Work Order's date.",
    },
  });
}

// ---------------------------------------------------------------------------
// Lines: cumulative − previous
// ---------------------------------------------------------------------------

export type BillLineInput = {
  workOrderLineId: string;
  itemNo: string | null;
  description: string;
  uomId: string;
  /** Paise per UoM: the Work Order line's rate now. */
  rate: bigint;
  /** The Work Order line's quantity; null when the line was removed. */
  workOrderQuantity: bigint | null;
  /** Σ the line on earlier approved bills. */
  previousQuantity: bigint;
  /** Σ this bill's rows on the line. */
  quantity: bigint;
};

export type BillLineFigures = BillLineInput & LineFigures;

/** One line of the abstract: cumulative − previous, each rounded half up. */
export function billLine(input: BillLineInput): BillLineFigures {
  return { ...input, ...lineFigures(input) };
}

/**
 * Billing never goes past the Work Order (ADR CM-0023 §5): a line whose
 * cumulative quantity is above its Work Order quantity (or whose Work
 * Order line was removed by an amendment) is 409
 * `WORK_ORDER_QUANTITY_EXCEEDED` with `details.lineId`,
 * `details.cumulative` and `details.workOrderQuantity`.
 */
export function assertWithinWorkOrder(
  lines: readonly Pick<
    BillLineFigures,
    "workOrderLineId" | "itemNo" | "cumulativeQuantity" | "workOrderQuantity"
  >[],
): void {
  for (const line of lines) {
    const ordered = line.workOrderQuantity ?? 0n;
    if (line.cumulativeQuantity <= ordered) continue;
    const name = line.itemNo == null ? "A line" : `Line ${line.itemNo}`;
    throw conflict(
      "WORK_ORDER_QUANTITY_EXCEEDED",
      line.workOrderQuantity == null
        ? `${name} was removed from the Work Order, but ${trimmed(line.cumulativeQuantity)} of it is measured. Amend the Work Order first.`
        : `${name} would be billed to ${trimmed(line.cumulativeQuantity)}, more than the ${trimmed(ordered)} on the Work Order. Amend the Work Order first.`,
      {
        lineId: line.workOrderLineId,
        cumulative: quantityText(line.cumulativeQuantity),
        workOrderQuantity: quantityText(ordered),
      },
    );
  }
}

export type UnbilledLine = {
  workOrderLineId: string;
  itemNo: string | null;
  /** Cumulative billed with this bill. */
  billed: bigint;
  workOrderQuantity: bigint;
};

/**
 * The Work Order lines a Final bill would leave short: cumulative billed
 * (earlier approved bills + this one) below the line's quantity.
 */
export function unbilledLines(
  workOrderLines: readonly {
    id: string;
    itemNo: string | null;
    quantity: bigint;
  }[],
  billedWithThis: ReadonlyMap<string, bigint>,
): UnbilledLine[] {
  return workOrderLines
    .map((line) => ({
      workOrderLineId: line.id,
      itemNo: line.itemNo,
      billed: billedWithThis.get(line.id) ?? 0n,
      workOrderQuantity: line.quantity,
    }))
    .filter((line) => line.billed < line.workOrderQuantity);
}

// ---------------------------------------------------------------------------
// Retention
// ---------------------------------------------------------------------------

/**
 * Retention on a bill (ADR CM-0023 §7): gross × the Work Order's retention
 * %, cut so the retention held on the Work Order's approved bills never
 * passes cap % × its value (the current revision). The suggestion is also
 * the most a bill may hold; it can be edited down.
 */
export function retentionSuggestion(input: {
  gross: bigint;
  retentionPercent: bigint;
  retentionCapPercent: bigint | null;
  workOrderValue: bigint;
  heldBefore: bigint;
}): RetentionSuggestion {
  return raRetentionSuggestion({
    ...input,
    contractValue: input.workOrderValue,
  });
}

// ---------------------------------------------------------------------------
// Deductions and net
// ---------------------------------------------------------------------------

export type BillDeduction = RaBillDeduction;

/**
 * Checks the deductions as typed: at most 20, each a kind CM-1106 takes
 * (400 `BILL_DEDUCTION_KIND_INVALID`), an amount of more than ₹0 up to
 * ₹1,000 crore (400 `BILL_DEDUCTION_AMOUNT_INVALID`) and a description of
 * at most 200 characters, required for "other" (400
 * `BILL_DEDUCTION_REASON_REQUIRED`).
 */
export function billDeductions(
  inputs: readonly BillDeductionInput[],
): BillDeduction[] {
  return raBillDeductions(
    inputs,
    CONTRACTOR_BILL_DEDUCTION_KINDS,
    "Pick retention, mobilisation or secured advance recovery, material issued at cost, material reconciliation recovery or other.",
  );
}

/**
 * Retention is never above the suggestion (400
 * `BILL_RETENTION_OVER_CAP`, `details.max`), and all deductions together
 * never above gross + the GST payable to the Contractor (400
 * `BILL_DEDUCTIONS_TOO_LARGE`, `details.max`): the net is never negative.
 */
export function assertDeductions(input: {
  deductions: readonly { kind: string; amount: bigint }[];
  gross: bigint;
  payableGst: bigint;
  retentionMax: bigint;
}): void {
  assertRaDeductions({ ...input, contract: "Work Order" });
}

/** What the bill page and PDF say about the TDS estimate (ADR CM-0023 §7). */
export const TDS_ESTIMATE_NOTE =
  "Estimate only: TDS is deducted when the bill is paid, on that payment's figures.";

/** The close reason a Final bill writes on its Work Order. */
export function finalCloseReason(number: string): string {
  return `Final bill ${number} approved.`;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export const billNotFound = () =>
  notFound("BILL_NOT_FOUND", "This Contractor Bill was not found.");

/** The partial unique index: one draft or pending RA bill per Work Order. */
export const billOpenExists = () =>
  conflict(
    "BILL_OPEN_EXISTS",
    "This Work Order already has a bill in draft or waiting for approval. Finish that one first.",
  );

export const billNumberTaken = () =>
  conflict(
    "BILL_NUMBER_TAKEN",
    "Another bill already has this number. Check the Contractor Bill sequence rule.",
  );

export const billNoMeasurements = () =>
  field(
    "BILL_NO_MEASUREMENTS",
    "No checked measurements of this Work Order up to that date are waiting to be billed.",
    "measuredUpTo",
  );

export const billWorkOrderInvalid = () =>
  field(
    "BILL_WORK_ORDER_INVALID",
    "Pick an issued Work Order of this Project.",
    "workOrderId",
  );

export const billWorkOrderNotIssued = (status: string) =>
  conflict(
    "BILL_WORK_ORDER_NOT_ISSUED",
    `The Work Order is ${status === "pending_approval" ? "pending approval" : status}, so it cannot be billed.`,
    { status },
  );

export const billNotLatest = () =>
  conflict(
    "BILL_NOT_LATEST",
    "Only the latest bill on a Work Order can be reversed, and only while no later bill is open. Reverse or delete the later ones first.",
  );

export const billSettled = () =>
  conflict(
    "BILL_SETTLED",
    "This bill's invoice has payments or a write-off against it, so it cannot be reversed. Cancel them in finance first.",
  );

export const billInvoiceNumberTaken = (number: string) =>
  conflict(
    "BILL_INVOICE_NUMBER_TAKEN",
    `The Contractor already has an invoice numbered ${number} in finance. Renumber that invoice, or give this Project's Contractor Bill rule a project token.`,
    { number },
  );

export const billFinalUnbilled = (lines: readonly UnbilledLine[]) =>
  conflict(
    "BILL_FINAL_UNBILLED",
    lines.length === 1
      ? "One Work Order line is not fully billed. Approve the Final bill anyway to close the Work Order short?"
      : `${String(lines.length)} Work Order lines are not fully billed. Approve the Final bill anyway to close the Work Order short?`,
    {
      lines: lines.map((line) => ({
        lineId: line.workOrderLineId,
        itemNo: line.itemNo,
        billed: quantityText(line.billed),
        workOrderQuantity: quantityText(line.workOrderQuantity),
      })),
    },
  );
