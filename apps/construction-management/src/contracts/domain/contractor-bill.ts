import {
  optionalText,
  requiredText,
  type DocumentNaming,
} from "@/src/shared-kernel/approval";
import {
  assertCalendarDate,
  daysBetween,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { divideRounded } from "@/src/shared-kernel/decimal";
import {
  DomainError,
  conflict,
  notFound,
} from "@/src/shared-kernel/domain-error";
import {
  defaultSupplyType,
  splitGst,
  type SupplyType,
} from "@/src/shared-kernel/gst-line";

import { boqAmount, quantityText } from "./boq";
import {
  DEDUCTION_KIND_LABELS,
  type BillStatus,
  type DeductionKind,
} from "./contract-terms";
import { RATE_MAX } from "./item-analysis";
import { trimmed } from "./measurement";

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

export const BILL_REMARKS_MAX = 2000;
export const BILL_DEDUCTIONS_MAX = 20;
export const BILL_DEDUCTION_DESCRIPTION_MAX = 200;
/** Hundredths of a percent in one percent: `percent / 100` = `hundredths / 10,000`. */
const HUNDREDTHS = 10_000n;

/**
 * The deductions a Contractor Bill takes in CM-1106. Secured advance
 * recovery arrives with advances (CM-1108) and material reconciliation
 * recovery with reconciliation (CM-1110).
 */
export const CONTRACTOR_BILL_DEDUCTION_KINDS = [
  "retention",
  "mobilisation_recovery",
  "material_at_cost",
  "other",
] as const satisfies readonly DeductionKind[];
export type ContractorBillDeductionKind =
  (typeof CONTRACTOR_BILL_DEDUCTION_KINDS)[number];

function field(code: string, message: string, name: string): DomainError {
  return new DomainError(code, message, { details: { field: name } });
}

function deductionField(
  code: string,
  message: string,
  index: number,
  name: string,
): DomainError {
  return new DomainError(code, message, {
    details: { deduction: index, field: `deductions.${String(index)}.${name}` },
  });
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

export type BillHeaderInput = {
  billDate: string;
  measuredUpTo: string;
  remarks?: string | null;
  isFinal?: boolean | null;
};

export type BillHeader = {
  billDate: CalendarDate;
  measuredUpTo: CalendarDate;
  remarks: string | null;
  isFinal: boolean;
};

/**
 * The bill date is not after the Company's today and not before the Work
 * Order's date; "measured up to" is not after the bill date. Remarks are
 * at most 2,000 characters and keep their line breaks.
 */
export function billHeader(
  input: BillHeaderInput,
  context: { today: CalendarDate; orderDate: CalendarDate },
): BillHeader {
  const billDate = assertCalendarDate(
    input.billDate.trim(),
    "BILL_DATE_INVALID",
  );
  const measuredUpTo = assertCalendarDate(
    input.measuredUpTo.trim(),
    "MEASURED_UP_TO_INVALID",
  );
  if (daysBetween(context.today, billDate) > 0)
    throw field(
      "BILL_DATE_IN_FUTURE",
      "The bill date cannot be after today.",
      "billDate",
    );
  if (daysBetween(context.orderDate, billDate) < 0)
    throw field(
      "BILL_DATE_BEFORE_ORDER_DATE",
      "The bill date is on or after the Work Order's date.",
      "billDate",
    );
  if (daysBetween(billDate, measuredUpTo) > 0)
    throw field(
      "MEASURED_UP_TO_AFTER_BILL_DATE",
      "Bill measurements up to the bill date at the latest.",
      "measuredUpTo",
    );
  const remarks = input.remarks?.trim() ?? "";
  if (remarks.length > BILL_REMARKS_MAX)
    throw field(
      "BILL_REMARKS_TOO_LONG",
      `Remarks are at most ${BILL_REMARKS_MAX.toLocaleString("en-IN")} characters.`,
      "remarks",
    );
  return {
    billDate,
    measuredUpTo,
    remarks: remarks === "" ? null : remarks,
    isFinal: input.isFinal === true,
  };
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

export type BillLineFigures = BillLineInput & {
  cumulativeQuantity: bigint;
  /** round(previous × rate). */
  previousAmount: bigint;
  /** round(cumulative × rate). */
  cumulativeAmount: bigint;
  /** cumulativeAmount − previousAmount. */
  amount: bigint;
};

/** One line of the abstract: cumulative − previous, each rounded half up. */
export function billLine(input: BillLineInput): BillLineFigures {
  const cumulativeQuantity = input.previousQuantity + input.quantity;
  const previousAmount = boqAmount(input.previousQuantity, input.rate);
  const cumulativeAmount = boqAmount(cumulativeQuantity, input.rate);
  return {
    ...input,
    cumulativeQuantity,
    previousAmount,
    cumulativeAmount,
    amount: cumulativeAmount - previousAmount,
  };
}

export type BillValues = {
  /** Σ round(cumulative × rate). */
  cumulativeValue: bigint;
  /** Σ round(previous × rate). */
  previousValue: bigint;
  /** cumulativeValue − previousValue = Σ line amounts. */
  gross: bigint;
};

export function billValues(
  lines: readonly Pick<
    BillLineFigures,
    "cumulativeAmount" | "previousAmount" | "amount"
  >[],
): BillValues {
  let cumulativeValue = 0n;
  let previousValue = 0n;
  for (const line of lines) {
    cumulativeValue += line.cumulativeAmount;
    previousValue += line.previousAmount;
  }
  return {
    cumulativeValue,
    previousValue,
    gross: cumulativeValue - previousValue,
  };
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

export type RetentionSuggestion = {
  /** gross × retention %, half up (0 for a gross of 0 or less). */
  byPercent: bigint;
  /** cap % × the Work Order's value; null without a cap. */
  cap: bigint | null;
  /** Retention already held on the Work Order's approved bills. */
  heldBefore: bigint;
  /** What this bill may hold: byPercent, cut to what the cap leaves. */
  suggested: bigint;
};

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
  const byPercent =
    input.gross > 0n
      ? divideRounded(input.gross * input.retentionPercent, HUNDREDTHS)
      : 0n;
  const cap =
    input.retentionCapPercent == null
      ? null
      : divideRounded(
          input.workOrderValue * input.retentionCapPercent,
          HUNDREDTHS,
        );
  const room =
    cap == null
      ? null
      : cap - input.heldBefore > 0n
        ? cap - input.heldBefore
        : 0n;
  return {
    byPercent,
    cap,
    heldBefore: input.heldBefore,
    suggested: room == null || byPercent < room ? byPercent : room,
  };
}

// ---------------------------------------------------------------------------
// GST
// ---------------------------------------------------------------------------

export type BillGst = {
  supplyType: SupplyType;
  /** Hundredths of a percent; 0 when the Work Order sets none. */
  rate: bigint;
  cgst: bigint;
  sgst: bigint;
  igst: bigint;
  /** cgst + sgst + igst. */
  total: bigint;
  reverseCharge: boolean;
  /** What the Contractor is paid as GST: the total, or 0 under reverse charge. */
  payable: bigint;
};

/**
 * GST on the gross at the Work Order's rate (ADR CM-0023 §7, §11). The
 * place of supply of works on immovable property is the Project's state:
 * the Contractor's state the same, or either unknown, is intra-state
 * (CGST + SGST, CGST takes the odd paisa, as procurement does); different
 * states are IGST. Under **reverse charge** the GST is shown but the
 * Company pays it, so it is not payable to the Contractor.
 */
export function billGst(input: {
  gross: bigint;
  gstRate: bigint | null;
  reverseCharge: boolean;
  supplierStateCode: string | null;
  placeOfSupplyStateCode: string | null;
}): BillGst {
  const rate = input.gstRate ?? 0n;
  const supplyType = defaultSupplyType(
    input.supplierStateCode,
    input.placeOfSupplyStateCode,
  );
  const total =
    input.gross > 0n ? divideRounded(input.gross * rate, HUNDREDTHS) : 0n;
  const split = splitGst(total, supplyType);
  return {
    supplyType,
    rate,
    ...split,
    total,
    reverseCharge: input.reverseCharge,
    payable: input.reverseCharge ? 0n : total,
  };
}

// ---------------------------------------------------------------------------
// Deductions and net
// ---------------------------------------------------------------------------

export type BillDeductionInput = {
  kind: string;
  /** Paise, more than 0. */
  amount: number | bigint;
  description?: string | null;
};

export type BillDeduction = {
  kind: ContractorBillDeductionKind;
  amount: bigint;
  description: string | null;
  /** The advance a recovery recovers (CM-1108); null until then. */
  advanceId: string | null;
};

function isDeductionKind(kind: string): kind is ContractorBillDeductionKind {
  return (CONTRACTOR_BILL_DEDUCTION_KINDS as readonly string[]).includes(kind);
}

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
  if (inputs.length > BILL_DEDUCTIONS_MAX)
    throw field(
      "BILL_TOO_MANY_DEDUCTIONS",
      `A bill has at most ${String(BILL_DEDUCTIONS_MAX)} deductions.`,
      "deductions",
    );
  return inputs.map((input, index) => {
    if (!isDeductionKind(input.kind))
      throw deductionField(
        "BILL_DEDUCTION_KIND_INVALID",
        "Pick retention, mobilisation advance recovery, material issued at cost or other.",
        index,
        "kind",
      );
    const amount =
      typeof input.amount === "bigint"
        ? input.amount
        : Number.isSafeInteger(input.amount)
          ? BigInt(input.amount)
          : -1n;
    if (amount <= 0n || amount > RATE_MAX)
      throw deductionField(
        "BILL_DEDUCTION_AMOUNT_INVALID",
        "Enter an amount of more than ₹0.",
        index,
        "amount",
      );
    const description =
      input.kind === "other"
        ? requiredText(
            input.description,
            "BILL_DEDUCTION_REASON_REQUIRED",
            `deductions.${String(index)}.description`,
          )
        : optionalText(
            input.description,
            `deductions.${String(index)}.description`,
          );
    if (
      description != null &&
      description.length > BILL_DEDUCTION_DESCRIPTION_MAX
    )
      throw deductionField(
        "TEXT_TOO_LONG",
        `Use at most ${String(BILL_DEDUCTION_DESCRIPTION_MAX)} characters.`,
        index,
        "description",
      );
    return { kind: input.kind, amount, description, advanceId: null };
  });
}

export function deductionsTotal(
  deductions: readonly { amount: bigint }[],
): bigint {
  return deductions.reduce((sum, deduction) => sum + deduction.amount, 0n);
}

export function retentionTotal(
  deductions: readonly { kind: string; amount: bigint }[],
): bigint {
  return deductions
    .filter((deduction) => deduction.kind === "retention")
    .reduce((sum, deduction) => sum + deduction.amount, 0n);
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
  const retention = retentionTotal(input.deductions);
  if (retention > input.retentionMax)
    throw new DomainError(
      "BILL_RETENTION_OVER_CAP",
      input.retentionMax === 0n
        ? "This Work Order holds no more retention on this bill."
        : `Retention on this bill is at most ₹${rupees(input.retentionMax)} (the Work Order's retention %, within its cap).`,
      {
        details: {
          field: "deductions",
          max: Number(input.retentionMax),
        },
      },
    );
  const max = input.gross + input.payableGst;
  if (deductionsTotal(input.deductions) > (max > 0n ? max : 0n))
    throw new DomainError(
      "BILL_DEDUCTIONS_TOO_LARGE",
      "Deductions cannot be more than the gross and the GST payable on it.",
      { details: { field: "deductions", max: Number(max > 0n ? max : 0n) } },
    );
}

/** gross + GST payable to the Contractor − deductions. */
export function billNet(input: {
  gross: bigint;
  payableGst: bigint;
  deductionsTotal: bigint;
}): bigint {
  return input.gross + input.payableGst - input.deductionsTotal;
}

/** `12345678n` → `"1,23,456.78"`, for messages. */
export function rupees(paise: bigint): string {
  const negative = paise < 0n;
  const abs = negative ? -paise : paise;
  const whole = (abs / 100n).toString();
  const fraction = (abs % 100n).toString().padStart(2, "0");
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${negative ? "−" : ""}${rest === "" ? last3 : `${rest},${last3}`}.${fraction}`;
}

/** The label a deduction kind prints. */
export function deductionLabel(kind: DeductionKind): string {
  return DEDUCTION_KIND_LABELS[kind];
}

// ---------------------------------------------------------------------------
// Life
// ---------------------------------------------------------------------------

const ACTION_WORDS = {
  edit: "edited",
  refresh: "refreshed",
  delete: "deleted",
  submit: "submitted",
  reverse: "reversed",
} as const;

export type BillAction = keyof typeof ACTION_WORDS;

const ALLOWED: Record<BillAction, readonly BillStatus[]> = {
  edit: ["draft"],
  refresh: ["draft"],
  delete: ["draft"],
  submit: ["draft"],
  reverse: ["approved"],
};

const STATUS_WORDS: Record<BillStatus, string> = {
  draft: "a draft",
  pending_approval: "pending approval",
  approved: "approved",
  rejected: "rejected",
  reversed: "reversed",
};

/**
 * Which status each action needs (409 `BILL_STATUS_INVALID`, with
 * `details.status` and `details.action`): a draft is edited, refreshed,
 * deleted or submitted; an approved bill reversed. Approve and Reject need
 * pending approval (the approval kernel: 409 `BILL_NOT_PENDING`).
 */
export function assertBillAction(status: BillStatus, action: BillAction): void {
  if (ALLOWED[action].includes(status)) return;
  throw conflict(
    "BILL_STATUS_INVALID",
    `This bill is ${STATUS_WORDS[status]}, so it cannot be ${ACTION_WORDS[action]}.`,
    { status, action },
  );
}

/** What a bill allows in its status (the flags are checked apart). */
export function billActions(
  status: BillStatus,
): Record<BillAction | "approve" | "reject", boolean> {
  return {
    edit: ALLOWED.edit.includes(status),
    refresh: ALLOWED.refresh.includes(status),
    delete: ALLOWED.delete.includes(status),
    submit: ALLOWED.submit.includes(status),
    reverse: ALLOWED.reverse.includes(status),
    approve: status === "pending_approval",
    reject: status === "pending_approval",
  };
}

/** The reason a reversal carries: required, ≤ 500. */
export function reverseReason(raw: string | null | undefined): string {
  return requiredText(raw, "REVERSE_REASON_REQUIRED", "reason");
}

/** The close reason a Final bill writes on its Work Order. */
export function finalCloseReason(number: string): string {
  return `Final bill ${number} approved.`;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export const billNotFound = () =>
  notFound("BILL_NOT_FOUND", "This Contractor Bill was not found.");

/** Approve and Reject decide only a bill pending approval. */
export const billNotPending = (status: BillStatus) =>
  conflict(
    "BILL_NOT_PENDING",
    `This bill is ${STATUS_WORDS[status]}, not pending approval.`,
    { status },
  );

export const billChanged = () =>
  conflict(
    "BILL_CHANGED",
    "Someone changed this bill after you opened it. Reload to see the latest.",
  );

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

export const billGrossNotPositive = () =>
  conflict(
    "BILL_GROSS_NOT_POSITIVE",
    "This bill's gross is ₹0 or less, so it cannot be sent for approval.",
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
