import { optionalText, requiredText } from "@/src/shared-kernel/approval";
import {
  assertCalendarDate,
  daysBetween,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { divideRounded } from "@/src/shared-kernel/decimal";
import { conflict, DomainError } from "@/src/shared-kernel/domain-error";
import {
  defaultSupplyType,
  splitGst,
  type SupplyType,
} from "@/src/shared-kernel/gst-line";

import { boqAmount } from "./boq";
import {
  DEDUCTION_KIND_LABELS,
  type BillStatus,
  type DeductionKind,
} from "./contract-terms";
import { RATE_MAX } from "./item-analysis";

/**
 * The running-account (RA) bill engine both sides share (ADR CM-0023 §7):
 * Contractor Bills (CM-1106, inward, on a Work Order) and Client Bills
 * (CM-1107, outward, on the BOQ). A bill takes every **checked**
 * measurement row of its side up to "measured up to" that no other bill
 * took, and per line bills
 *
 * - this bill's quantity = Σ its rows;
 * - previous quantity = Σ the line on earlier **approved** bills;
 * - cumulative = previous + this;
 * - amount = round(cumulative × rate) − round(previous × rate), half up.
 *
 * Gross = Σ amounts = cumulative value − previous value. GST is on the
 * gross; deductions (retention, recoveries, material at cost, other) are
 * typed; net = gross + GST payable − deductions. Life: draft → submit
 * (numbered) → pending approval → approved (a finance invoice) or rejected;
 * an approved bill may be reversed while it is the latest and unsettled.
 * What differs by side (the line's source, the limit on quantities, the
 * party, GST's supplier, the invoice's direction) lives in
 * `contractor-bill.ts` and `client-bill.ts`. Quantities are
 * ten-thousandths, money paise, percentages hundredths.
 */

export const BILL_REMARKS_MAX = 2000;
export const BILL_DEDUCTIONS_MAX = 20;
export const BILL_DEDUCTION_DESCRIPTION_MAX = 200;
/** Hundredths of a percent in one percent: `percent / 100` = `hundredths / 10,000`. */
const HUNDREDTHS = 10_000n;

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
 * The bill date is not after the Company's today (400
 * `BILL_DATE_IN_FUTURE`) and, when the side has one, not before its
 * earliest date (a Work Order's date); "measured up to" is not after the
 * bill date. Remarks are at most 2,000 characters and keep their line
 * breaks.
 */
export function raBillHeader(
  input: BillHeaderInput,
  context: {
    today: CalendarDate;
    notBefore?: { date: CalendarDate; code: string; message: string } | null;
  },
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
  const notBefore = context.notBefore;
  if (notBefore != null && daysBetween(notBefore.date, billDate) < 0)
    throw field(notBefore.code, notBefore.message, "billDate");
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

export type LineFigures = {
  cumulativeQuantity: bigint;
  /** round(previous × rate). */
  previousAmount: bigint;
  /** round(cumulative × rate). */
  cumulativeAmount: bigint;
  /** cumulativeAmount − previousAmount. */
  amount: bigint;
};

/** One line of the abstract: cumulative − previous, each rounded half up. */
export function lineFigures(input: {
  /** Paise per UoM. */
  rate: bigint;
  previousQuantity: bigint;
  quantity: bigint;
}): LineFigures {
  const cumulativeQuantity = input.previousQuantity + input.quantity;
  const previousAmount = boqAmount(input.previousQuantity, input.rate);
  const cumulativeAmount = boqAmount(cumulativeQuantity, input.rate);
  return {
    cumulativeQuantity,
    previousAmount,
    cumulativeAmount,
    amount: cumulativeAmount - previousAmount,
  };
}

/** Σ a bill's rows per line key (a Work Order line or a BOQ item). */
export function sumRowsBy<R extends { quantity: bigint }, K extends string>(
  rows: readonly R[],
  key: (row: R) => K,
): Map<K, bigint> {
  const sums = new Map<K, bigint>();
  for (const row of rows)
    sums.set(key(row), (sums.get(key(row)) ?? 0n) + row.quantity);
  return sums;
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
    LineFigures,
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

// ---------------------------------------------------------------------------
// Retention
// ---------------------------------------------------------------------------

export type RetentionSuggestion = {
  /** gross × retention %, half up (0 for a gross of 0 or less). */
  byPercent: bigint;
  /** cap % × the contract's value; null without a cap. */
  cap: bigint | null;
  /** Retention already held on the contract's approved bills. */
  heldBefore: bigint;
  /** What this bill may hold: byPercent, cut to what the cap leaves. */
  suggested: bigint;
};

/**
 * Retention on a bill (ADR CM-0023 §7): gross × the retention %, cut so
 * the retention on the contract's approved bills never passes cap % × the
 * contract's value (a Work Order's current revision, or the BOQ's current
 * value). The suggestion is also the most a bill may hold; it can be
 * edited down. Releases do not make room under the cap.
 */
export function raRetentionSuggestion(input: {
  gross: bigint;
  retentionPercent: bigint;
  retentionCapPercent: bigint | null;
  contractValue: bigint;
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
          input.contractValue * input.retentionCapPercent,
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
  /** Hundredths of a percent; 0 when the terms set none. */
  rate: bigint;
  cgst: bigint;
  sgst: bigint;
  igst: bigint;
  /** cgst + sgst + igst. */
  total: bigint;
  reverseCharge: boolean;
  /** What the party is paid or pays as GST: the total, or 0 under reverse charge. */
  payable: bigint;
};

/**
 * GST on the gross (ADR CM-0023 §7, §11). The place of supply of works on
 * immovable property is the Project's state: the supplier's state the
 * same, or either unknown, is intra-state (CGST + SGST, CGST takes the odd
 * paisa, as procurement does); different states are IGST. GST is rounded
 * once on the gross. Under **reverse charge** the GST is shown but the
 * recipient pays it to the government, so none is payable on the bill.
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

/** A stored bill's GST as worked out when it was drafted or refreshed. */
export function storedBillGst(bill: {
  gstRate: bigint | null;
  cgst: bigint;
  sgst: bigint;
  igst: bigint;
  reverseCharge: boolean;
}): BillGst {
  const total = bill.cgst + bill.sgst + bill.igst;
  return {
    supplyType: bill.igst > 0n ? "inter_state" : "intra_state",
    rate: bill.gstRate ?? 0n,
    cgst: bill.cgst,
    sgst: bill.sgst,
    igst: bill.igst,
    total,
    reverseCharge: bill.reverseCharge,
    payable: bill.reverseCharge ? 0n : total,
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
  /** A mobilisation or secured advance recovery: the advance it recovers (CM-1108). */
  advanceId?: string | null;
};

export type RaBillDeduction<K extends DeductionKind = DeductionKind> = {
  kind: K;
  amount: bigint;
  description: string | null;
  /** The advance a recovery recovers (CM-1108); null on other kinds. */
  advanceId: string | null;
};

/**
 * Checks the deductions as typed: at most 20, each one of `kinds` (400
 * `BILL_DEDUCTION_KIND_INVALID`, `kindMessage`), an amount of more than ₹0
 * up to ₹1,000 crore (400 `BILL_DEDUCTION_AMOUNT_INVALID`) and a
 * description of at most 200 characters, required for "other" (400
 * `BILL_DEDUCTION_REASON_REQUIRED`).
 */
export function raBillDeductions<K extends DeductionKind>(
  inputs: readonly BillDeductionInput[],
  kinds: readonly K[],
  kindMessage: string,
): RaBillDeduction<K>[] {
  if (inputs.length > BILL_DEDUCTIONS_MAX)
    throw field(
      "BILL_TOO_MANY_DEDUCTIONS",
      `A bill has at most ${String(BILL_DEDUCTIONS_MAX)} deductions.`,
      "deductions",
    );
  const allowed = kinds as readonly string[];
  return inputs.map((input, index) => {
    if (!allowed.includes(input.kind))
      throw deductionField(
        "BILL_DEDUCTION_KIND_INVALID",
        kindMessage,
        index,
        "kind",
      );
    const kind = input.kind as K;
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
      kind === "other"
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
    const recovery =
      kind === "mobilisation_recovery" || kind === "secured_advance_recovery";
    const named = input.advanceId?.trim() ?? "";
    const advanceId = recovery && named !== "" ? named : null;
    return { kind, amount, description, advanceId };
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
 * never above gross + the GST payable (400 `BILL_DEDUCTIONS_TOO_LARGE`,
 * `details.max`): the net is never negative. `contract` names what the
 * cap belongs to in the message ("Work Order", "client contract").
 */
export function assertRaDeductions(input: {
  deductions: readonly { kind: string; amount: bigint }[];
  gross: bigint;
  payableGst: bigint;
  retentionMax: bigint;
  contract: string;
}): void {
  const retention = retentionTotal(input.deductions);
  if (retention > input.retentionMax)
    throw new DomainError(
      "BILL_RETENTION_OVER_CAP",
      input.retentionMax === 0n
        ? `This ${input.contract} holds no more retention on this bill.`
        : `Retention on this bill is at most ₹${rupees(input.retentionMax)} (the ${input.contract}'s retention %, within its cap).`,
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

/** gross + GST payable − deductions. */
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

// ---------------------------------------------------------------------------
// Errors both sides raise
// ---------------------------------------------------------------------------

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

export const billGrossNotPositive = () =>
  conflict(
    "BILL_GROSS_NOT_POSITIVE",
    "This bill's gross is ₹0 or less, so it cannot be sent for approval.",
  );
