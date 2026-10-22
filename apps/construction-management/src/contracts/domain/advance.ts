import { optionalText, requiredText } from "@/src/shared-kernel/approval";
import {
  assertCalendarDate,
  daysBetween,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { divideRounded } from "@/src/shared-kernel/decimal";
import { conflict, DomainError } from "@/src/shared-kernel/domain-error";

import {
  ADVANCE_KINDS,
  GUARANTEE_PURPOSES,
  RECOVERY_MODES,
  RETENTION_STAGES,
  type AdvanceKind,
  type DeductionKind,
  type GuaranteePurpose,
  type RecoveryMode,
  type RetentionStage,
} from "./contract-terms";
import { PERCENT_SCALE, RATE_MAX, scaledDecimal } from "./item-analysis";
import { rupees, type RaBillDeduction } from "./ra-bill";

/**
 * Advances, retention release, DLP and bank guarantees (CM-1108, ADR
 * CM-0023 §8), on either side of a contract: a Work Order (an advance
 * **given** to its Contractor, retention **held**) or the Project's client
 * contract (an advance **received** from the Client, retention
 * **receivable**). Money is paise, percentages hundredths of a percent.
 *
 * - An advance is recovered from later bills: each suggests
 *   min(the rule's amount, what is left of the advance), where the rule is
 *   a % of the bill's gross or a fixed amount per bill.
 * - Releasable retention = retention deducted on approved bills − what was
 *   released. A completion release suggests completion % × the retention
 *   deducted (less what was released already); a DLP-end release the rest.
 * - The DLP runs from completion (the Work Order's completion date, or the
 *   client contract's handover date) for its months.
 */

export const ADVANCE_REMARKS_MAX = 500;
export const GUARANTEE_NUMBER_MAX = 60;
export const GUARANTEE_BANK_MAX = 120;
export const RELEASE_REASON_MAX = 500;
/** One finance amount is at most ₹100 crore (finance's `MAX_AMOUNT`). */
export const ADVANCE_AMOUNT_MAX = 100_00_00_000_00n;
/** The daily notice warns this many days ahead (CM-0023 §8). */
export const DUE_SOON_DAYS = 30;

const HUNDRED_PERCENT = 100_00n;
/** Hundredths of a percent in one: `percent / 100` = `hundredths / 10,000`. */
const PERCENT_ONE = 10_000n;

function field(code: string, message: string, name: string): DomainError {
  return new DomainError(code, message, { details: { field: name } });
}

function given(
  raw: string | number | null | undefined,
): raw is string | number {
  return raw != null && !(typeof raw === "string" && raw.trim() === "");
}

function money(raw: number | bigint | null | undefined): bigint | null {
  if (raw == null) return null;
  if (typeof raw === "number" && !Number.isSafeInteger(raw)) return null;
  return BigInt(raw);
}

function limitedText(
  raw: string | null | undefined,
  name: string,
  max: number,
): string | null {
  const text = optionalText(raw, name);
  if (text != null && text.length > max)
    throw field(
      "TEXT_TOO_LONG",
      `Use at most ${String(max)} characters.`,
      name,
    );
  return text;
}

/** Whether `kind` is one of `kinds` (a narrowing check for parsed input). */
function oneOf<T extends string>(kinds: readonly T[], raw: string): raw is T {
  return (kinds as readonly string[]).includes(raw);
}

// ---------------------------------------------------------------------------
// Advances
// ---------------------------------------------------------------------------

export type AdvanceRecoveryInput = {
  recoveryMode: string;
  /**
   * `percent`: 0–100 with two places (`"10"`); blank takes the default.
   * `fixed`: paise per bill.
   */
  recoveryValue?: string | number | null;
};

export type AdvanceInput = AdvanceRecoveryInput & {
  kind: string;
  /** Paise. */
  amount: number | bigint;
  advanceOn: string;
  remarks?: string | null;
};

export type AdvanceRecovery = {
  recoveryMode: RecoveryMode;
  /** `percent`: hundredths of a percent of the gross; `fixed`: paise per bill. */
  recoveryValue: bigint;
};

export type AdvanceFields = AdvanceRecovery & {
  kind: AdvanceKind;
  amount: bigint;
  advanceOn: CalendarDate;
  remarks: string | null;
};

/**
 * The recovery rule: a % of each bill's gross (more than 0, up to 100,
 * two places; blank takes `defaultPercent`, the Work Order's mobilisation
 * recovery %) or a fixed amount per bill (more than ₹0, at most the
 * advance). 400 `RECOVERY_MODE_INVALID`, `RECOVERY_VALUE_REQUIRED`,
 * `RECOVERY_VALUE_INVALID`.
 */
export function advanceRecovery(
  input: AdvanceRecoveryInput,
  context: { amount: bigint; defaultPercent: bigint | null },
): AdvanceRecovery {
  const mode = input.recoveryMode.trim();
  if (!oneOf(RECOVERY_MODES, mode))
    throw field(
      "RECOVERY_MODE_INVALID",
      "Recover a % of each bill or a fixed amount per bill.",
      "recoveryMode",
    );
  if (mode === "percent") {
    let value: bigint | null;
    if (given(input.recoveryValue)) {
      value = scaledDecimal(input.recoveryValue, PERCENT_SCALE);
      if (value == null || value <= 0n || value > HUNDRED_PERCENT)
        throw field(
          "RECOVERY_VALUE_INVALID",
          "The recovery is a percentage of more than 0 up to 100, with at most two decimals.",
          "recoveryValue",
        );
    } else value = context.defaultPercent;
    if (value == null || value <= 0n)
      throw field(
        "RECOVERY_VALUE_REQUIRED",
        "Enter the % of each bill that recovers this advance.",
        "recoveryValue",
      );
    return { recoveryMode: mode, recoveryValue: value };
  }
  const value =
    typeof input.recoveryValue === "number"
      ? money(input.recoveryValue)
      : given(input.recoveryValue)
        ? scaledDecimal(input.recoveryValue, 0)
        : null;
  if (value == null)
    throw field(
      "RECOVERY_VALUE_REQUIRED",
      "Enter the amount each bill recovers.",
      "recoveryValue",
    );
  if (value <= 0n || value > context.amount)
    throw field(
      "RECOVERY_VALUE_INVALID",
      "The amount per bill is more than ₹0 and at most the advance.",
      "recoveryValue",
    );
  return { recoveryMode: mode, recoveryValue: value };
}

/**
 * Checks a new advance: a kind, an amount of more than ₹0 up to ₹100
 * crore (one finance payment), a date not after the Company's today, the
 * recovery rule and remarks of at most 500 characters.
 */
export function advanceFields(
  input: AdvanceInput,
  context: { today: CalendarDate; defaultPercent: bigint | null },
): AdvanceFields {
  const kind = input.kind.trim();
  if (!oneOf(ADVANCE_KINDS, kind))
    throw field(
      "ADVANCE_KIND_INVALID",
      "Pick mobilisation or secured advance.",
      "kind",
    );
  const amount = money(input.amount);
  if (amount == null || amount <= 0n || amount > ADVANCE_AMOUNT_MAX)
    throw field(
      "ADVANCE_AMOUNT_INVALID",
      "An advance is more than ₹0 and at most ₹100 crore.",
      "amount",
    );
  const advanceOn = assertCalendarDate(
    input.advanceOn.trim(),
    "ADVANCE_ON_INVALID",
  );
  if (daysBetween(context.today, advanceOn) > 0)
    throw field(
      "ADVANCE_ON_IN_FUTURE",
      "The advance date cannot be after today.",
      "advanceOn",
    );
  return {
    kind,
    amount,
    advanceOn,
    ...advanceRecovery(input, {
      amount,
      defaultPercent: kind === "mobilisation" ? context.defaultPercent : null,
    }),
    remarks: limitedText(input.remarks, "remarks", ADVANCE_REMARKS_MAX),
  };
}

/** An advance's remarks: trimmed, ≤ 500, empty is null. */
export function advanceRemarks(raw: string | null | undefined): string | null {
  return limitedText(raw, "remarks", ADVANCE_REMARKS_MAX);
}

/** What a bill recovers an advance as. */
export function recoveryKindOf(kind: AdvanceKind): DeductionKind {
  return kind === "mobilisation"
    ? "mobilisation_recovery"
    : "secured_advance_recovery";
}

export const RECOVERY_KINDS: readonly DeductionKind[] = [
  "mobilisation_recovery",
  "secured_advance_recovery",
];

export function isRecoveryKind(kind: string): boolean {
  return (RECOVERY_KINDS as readonly string[]).includes(kind);
}

/** An advance as a bill sees it. */
export type RecoverableAdvance = AdvanceRecovery & {
  id: string;
  kind: AdvanceKind;
  amount: bigint;
  advanceOn: CalendarDate;
  /** Σ recovery deductions naming it on approved bills (the bill asked about left out). */
  recovered: bigint;
  /** The finance payment or receipt that moved it; null for none. */
  paymentId: string | null;
};

/** What is left to recover: amount − recovered, never below 0. */
export function advanceBalance(advance: {
  amount: bigint;
  recovered: bigint;
}): bigint {
  const left = advance.amount - advance.recovered;
  return left > 0n ? left : 0n;
}

/** The rule's amount on a bill: round(gross × %) half up, or the fixed amount. */
export function recoveryRule(advance: AdvanceRecovery, gross: bigint): bigint {
  if (advance.recoveryMode === "fixed") return advance.recoveryValue;
  if (gross <= 0n) return 0n;
  return divideRounded(gross * advance.recoveryValue, PERCENT_ONE);
}

/** min(the rule's amount, what is left of the advance). */
export function recoverySuggestion(
  advance: RecoverableAdvance,
  gross: bigint,
): bigint {
  const rule = recoveryRule(advance, gross);
  const balance = advanceBalance(advance);
  return rule < balance ? rule : balance;
}

/** One suggested recovery line per advance with something to recover, oldest first. */
export function suggestedRecoveries<K extends DeductionKind>(
  advances: readonly RecoverableAdvance[],
  gross: bigint,
): RaBillDeduction<K>[] {
  return [...advances]
    .sort(
      (a, b) =>
        daysBetween(b.advanceOn, a.advanceOn) || a.id.localeCompare(b.id),
    )
    .flatMap((advance) => {
      const amount = recoverySuggestion(advance, gross);
      return amount > 0n
        ? [
            {
              kind: recoveryKindOf(advance.kind) as K,
              amount,
              description: null,
              advanceId: advance.id,
              escalationBillId: null,
            },
          ]
        : [];
    });
}

function deductionError(
  code: string,
  message: string,
  index: number,
  name: string,
  extra: Record<string, unknown> = {},
): DomainError {
  return new DomainError(code, message, {
    details: {
      deduction: index,
      field: `deductions.${String(index)}.${name}`,
      ...extra,
    },
  });
}

/**
 * Every mobilisation or secured advance recovery names one advance of the
 * bill's contract (400 `BILL_RECOVERY_ADVANCE_REQUIRED`,
 * `BILL_RECOVERY_ADVANCE_INVALID`) of its kind (400
 * `BILL_RECOVERY_KIND_MISMATCH`), once per bill (400
 * `BILL_RECOVERY_DUPLICATE`), and never more than is left of it (400
 * `BILL_RECOVERY_OVER_BALANCE`, `details.max`). `advances` carry what
 * approved bills other than this one recovered.
 */
export function assertRecoveries(
  deductions: readonly {
    kind: string;
    amount: bigint;
    advanceId: string | null;
  }[],
  advances: readonly RecoverableAdvance[],
): void {
  const byId = new Map(advances.map((advance) => [advance.id, advance]));
  const seen = new Set<string>();
  deductions.forEach((deduction, index) => {
    if (!isRecoveryKind(deduction.kind)) return;
    if (deduction.advanceId == null)
      throw deductionError(
        "BILL_RECOVERY_ADVANCE_REQUIRED",
        "Pick the advance this recovers.",
        index,
        "advanceId",
      );
    const advance = byId.get(deduction.advanceId);
    if (advance == null)
      throw deductionError(
        "BILL_RECOVERY_ADVANCE_INVALID",
        "Pick an advance of this contract.",
        index,
        "advanceId",
      );
    if (recoveryKindOf(advance.kind) !== deduction.kind)
      throw deductionError(
        "BILL_RECOVERY_KIND_MISMATCH",
        advance.kind === "mobilisation"
          ? "This is a mobilisation advance: recover it as a mobilisation advance recovery."
          : "This is a secured advance: recover it as a secured advance recovery.",
        index,
        "kind",
      );
    if (seen.has(advance.id))
      throw deductionError(
        "BILL_RECOVERY_DUPLICATE",
        "An advance is recovered once per bill.",
        index,
        "advanceId",
      );
    seen.add(advance.id);
    const balance = advanceBalance(advance);
    if (deduction.amount > balance)
      throw deductionError(
        "BILL_RECOVERY_OVER_BALANCE",
        balance === 0n
          ? "This advance is recovered in full."
          : `At most ₹${rupees(balance)} of this advance is left to recover.`,
        index,
        "amount",
        { max: Number(balance) },
      );
  });
}

/** Σ recoveries per advance on a bill. */
export function recoveriesByAdvance(
  deductions: readonly {
    kind: string;
    amount: bigint;
    advanceId: string | null;
  }[],
): Map<string, bigint> {
  const out = new Map<string, bigint>();
  for (const deduction of deductions)
    if (isRecoveryKind(deduction.kind) && deduction.advanceId != null)
      out.set(
        deduction.advanceId,
        (out.get(deduction.advanceId) ?? 0n) + deduction.amount,
      );
  return out;
}

/** Mobilisation advances given beyond the Work Order's agreed figure. */
export const ADVANCES_OVER_AGREED = "ADVANCES_OVER_AGREED";

export type AdvanceWarning = {
  code: typeof ADVANCES_OVER_AGREED;
  agreed: bigint;
  given: bigint;
  message: string;
};

/** A warning (never a refusal) when mobilisation advances given pass the agreed figure. */
export function advanceWarnings(input: {
  agreed: bigint | null;
  mobilisationGiven: bigint;
}): AdvanceWarning[] {
  if (input.agreed == null || input.mobilisationGiven <= input.agreed)
    return [];
  return [
    {
      code: ADVANCES_OVER_AGREED,
      agreed: input.agreed,
      given: input.mobilisationGiven,
      message: `Mobilisation advances given (₹${rupees(input.mobilisationGiven)}) are more than the ₹${rupees(input.agreed)} the Work Order agrees.`,
    },
  ];
}

// ---------------------------------------------------------------------------
// DLP
// ---------------------------------------------------------------------------

/** `date` plus `months` calendar months, clamped to the month's last day (31 Jan + 1 → 28/29 Feb). */
export function addMonths(date: CalendarDate, months: number): CalendarDate {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const index = y * 12 + (m - 1) + months;
  const year = Math.floor(index / 12);
  const month = index - year * 12 + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(d, last);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export type DlpPeriod = {
  /** Completion (a Work Order) or handover (the client contract); null until known. */
  startsOn: CalendarDate | null;
  months: number | null;
  /** start + months; the start itself without DLP months; null until the start is known. */
  endsOn: CalendarDate | null;
  /** Days from today to the end: negative once past, null until known. */
  daysLeft: number | null;
  /** The end is today or past. */
  ended: boolean;
};

export function dlpPeriod(
  startsOn: CalendarDate | null,
  months: number | null,
  today: CalendarDate,
): DlpPeriod {
  if (startsOn == null)
    return { startsOn, months, endsOn: null, daysLeft: null, ended: false };
  const endsOn = addMonths(startsOn, months ?? 0);
  const daysLeft = daysBetween(today, endsOn);
  return { startsOn, months, endsOn, daysLeft, ended: daysLeft <= 0 };
}

/** Within the next `days` days, today included (the daily notice). */
export function dueSoon(
  date: CalendarDate,
  today: CalendarDate,
  days = DUE_SOON_DAYS,
): boolean {
  const left = daysBetween(today, date);
  return left >= 0 && left <= days;
}

/** A Work Order's completion date (DLP start): not before the order date, not after today. */
export function completionDate(
  raw: string,
  context: { orderDate: CalendarDate; today: CalendarDate },
): CalendarDate {
  const date = assertCalendarDate(raw.trim(), "COMPLETED_ON_INVALID");
  if (daysBetween(context.orderDate, date) < 0)
    throw field(
      "COMPLETED_ON_BEFORE_ORDER_DATE",
      "Completion is on or after the Work Order's date.",
      "completedOn",
    );
  if (daysBetween(context.today, date) > 0)
    throw field(
      "COMPLETED_ON_IN_FUTURE",
      "The completion date cannot be after today.",
      "completedOn",
    );
  return date;
}

// ---------------------------------------------------------------------------
// Retention
// ---------------------------------------------------------------------------

export type RetentionPosition = {
  /** Σ retention deducted on approved, unreversed bills. */
  deducted: bigint;
  /** Σ live releases. */
  released: bigint;
  /** Held (Work Order) or receivable (client contract) now: deducted − released. */
  releasable: bigint;
  /** Hundredths of a percent released on completion. */
  completionPercent: bigint;
  /** round(completion % × deducted) − released, within what is releasable. */
  completionSuggestion: bigint;
  /** Everything releasable. */
  dlpEndSuggestion: bigint;
};

export function retentionPosition(input: {
  deducted: bigint;
  released: bigint;
  completionPercent: bigint;
}): RetentionPosition {
  const left = input.deducted - input.released;
  const releasable = left > 0n ? left : 0n;
  const share =
    divideRounded(input.deducted * input.completionPercent, PERCENT_ONE) -
    input.released;
  const completionSuggestion =
    share <= 0n ? 0n : share > releasable ? releasable : share;
  return {
    deducted: input.deducted,
    released: input.released,
    releasable,
    completionPercent: input.completionPercent,
    completionSuggestion,
    dlpEndSuggestion: releasable,
  };
}

export type ReleaseInput = {
  stage: string;
  /** Paise. */
  amount: number | bigint;
  releasedOn: string;
  reason?: string | null;
  bankGuaranteeId?: string | null;
};

export type ReleaseFields = {
  stage: RetentionStage;
  amount: bigint;
  releasedOn: CalendarDate;
  reason: string | null;
  bankGuaranteeId: string | null;
  /** A DLP-end release before the DLP ends (Approve and a reason). */
  beforeDlpEnd: boolean;
};

/**
 * Checks a release (CM-0023 §8):
 *
 * - an amount of more than ₹0 up to what is releasable (400
 *   `RELEASE_AMOUNT_INVALID`, `RELEASE_OVER_RELEASABLE` with `details.max`);
 * - a date not after today (400 `RELEASED_ON_IN_FUTURE`);
 * - **completion** needs the completion (handover) date, on or before the
 *   release (409 `COMPLETION_DATE_REQUIRED`, 400
 *   `RELEASED_ON_BEFORE_COMPLETION`);
 * - **DLP end** needs the DLP to have ended on the release date (409
 *   `DLP_NOT_ENDED`, `details.dlpEndsOn`), unless the caller holds Approve
 *   and gives a reason (400 `RELEASE_REASON_REQUIRED` without one);
 * - **against a bank guarantee** names one (400
 *   `RELEASE_GUARANTEE_REQUIRED`; the handler checks it is a live retention
 *   guarantee of the contract);
 * - **other** needs a reason (400 `RELEASE_REASON_REQUIRED`).
 */
export function releaseFields(
  input: ReleaseInput,
  context: {
    today: CalendarDate;
    releasable: bigint;
    dlp: DlpPeriod;
    canReleaseEarly: boolean;
  },
): ReleaseFields {
  const stage = input.stage.trim();
  if (!oneOf(RETENTION_STAGES, stage))
    throw field(
      "RETENTION_STAGE_INVALID",
      "Release on completion, at the end of the DLP, against a bank guarantee, or for another reason.",
      "stage",
    );
  const amount = money(input.amount);
  if (amount == null || amount <= 0n || amount > RATE_MAX)
    throw field(
      "RELEASE_AMOUNT_INVALID",
      "Release an amount of more than ₹0.",
      "amount",
    );
  if (amount > context.releasable)
    throw new DomainError(
      "RELEASE_OVER_RELEASABLE",
      context.releasable === 0n
        ? "No retention is left to release."
        : `At most ₹${rupees(context.releasable)} of retention is left to release.`,
      { details: { field: "amount", max: Number(context.releasable) } },
    );
  const releasedOn = assertCalendarDate(
    input.releasedOn.trim(),
    "RELEASED_ON_INVALID",
  );
  if (daysBetween(context.today, releasedOn) > 0)
    throw field(
      "RELEASED_ON_IN_FUTURE",
      "The release date cannot be after today.",
      "releasedOn",
    );
  const reason = limitedText(input.reason, "reason", RELEASE_REASON_MAX);
  const { dlp } = context;
  let beforeDlpEnd = false;
  if (stage === "completion" || stage === "dlp_end") {
    if (dlp.startsOn == null)
      throw conflict(
        "COMPLETION_DATE_REQUIRED",
        "Record the completion (or handover) date before releasing retention on completion or at the end of the DLP.",
      );
    if (daysBetween(dlp.startsOn, releasedOn) < 0)
      throw field(
        "RELEASED_ON_BEFORE_COMPLETION",
        "Release on or after the completion date.",
        "releasedOn",
      );
  }
  if (
    stage === "dlp_end" &&
    dlp.endsOn != null &&
    daysBetween(dlp.endsOn, releasedOn) < 0
  ) {
    if (!context.canReleaseEarly)
      throw conflict(
        "DLP_NOT_ENDED",
        `The DLP ends on ${dlp.endsOn}. Only someone who can approve may release it earlier, with a reason.`,
        { dlpEndsOn: dlp.endsOn },
      );
    if (reason == null)
      throw new DomainError(
        "RELEASE_REASON_REQUIRED",
        `The DLP ends on ${dlp.endsOn}. Say why it is released earlier.`,
        { details: { field: "reason", dlpEndsOn: dlp.endsOn } },
      );
    beforeDlpEnd = true;
  }
  if (stage === "other" && reason == null)
    throw field(
      "RELEASE_REASON_REQUIRED",
      "Say why the retention is released.",
      "reason",
    );
  const bankGuaranteeId =
    stage === "bank_guarantee" ? (input.bankGuaranteeId?.trim() ?? "") : "";
  if (stage === "bank_guarantee" && bankGuaranteeId === "")
    throw field(
      "RELEASE_GUARANTEE_REQUIRED",
      "Pick the retention bank guarantee it is released against.",
      "bankGuaranteeId",
    );
  return {
    stage,
    amount,
    releasedOn,
    reason,
    bankGuaranteeId: bankGuaranteeId === "" ? null : bankGuaranteeId,
    beforeDlpEnd,
  };
}

/** The reason a release is deleted with: required, ≤ 500. */
export function releaseDeleteReason(raw: string | null | undefined): string {
  const text = requiredText(raw, "DELETE_REASON_REQUIRED", "reason");
  if (text.length > RELEASE_REASON_MAX)
    throw field(
      "TEXT_TOO_LONG",
      `Use at most ${String(RELEASE_REASON_MAX)} characters.`,
      "reason",
    );
  return text;
}

// ---------------------------------------------------------------------------
// Bank guarantees
// ---------------------------------------------------------------------------

export type GuaranteeInput = {
  purpose: string;
  number: string;
  bank: string;
  /** Paise. */
  amount: number | bigint;
  issuedOn: string;
  expiresOn: string;
  /** Purpose `advance`: the advance it secures. */
  advanceId?: string | null;
  remarks?: string | null;
};

export type GuaranteeFields = {
  purpose: GuaranteePurpose;
  number: string;
  bank: string;
  amount: bigint;
  issuedOn: CalendarDate;
  expiresOn: CalendarDate;
  advanceId: string | null;
  remarks: string | null;
};

/**
 * Checks a bank guarantee: a purpose, a number (≤ 60) and bank (≤ 120),
 * an amount of more than ₹0, the issue date (not after today) and an
 * expiry on or after it, an advance for purpose `advance` (400
 * `GUARANTEE_ADVANCE_REQUIRED`; dropped otherwise), remarks ≤ 500.
 */
export function guaranteeFields(
  input: GuaranteeInput,
  context: { today: CalendarDate },
): GuaranteeFields {
  const purpose = input.purpose.trim();
  if (!oneOf(GUARANTEE_PURPOSES, purpose))
    throw field(
      "GUARANTEE_PURPOSE_INVALID",
      "Pick what the guarantee secures: an advance, retention or performance.",
      "purpose",
    );
  const number = input.number.trim().replace(/\s+/g, " ");
  if (number === "")
    throw field(
      "GUARANTEE_NUMBER_REQUIRED",
      "Enter the guarantee number.",
      "number",
    );
  if (number.length > GUARANTEE_NUMBER_MAX)
    throw field(
      "TEXT_TOO_LONG",
      `Use at most ${String(GUARANTEE_NUMBER_MAX)} characters.`,
      "number",
    );
  const bank = input.bank.trim().replace(/\s+/g, " ");
  if (bank === "")
    throw field("GUARANTEE_BANK_REQUIRED", "Enter the bank.", "bank");
  if (bank.length > GUARANTEE_BANK_MAX)
    throw field(
      "TEXT_TOO_LONG",
      `Use at most ${String(GUARANTEE_BANK_MAX)} characters.`,
      "bank",
    );
  const amount = money(input.amount);
  if (amount == null || amount <= 0n || amount > RATE_MAX)
    throw field(
      "GUARANTEE_AMOUNT_INVALID",
      "Enter the guarantee's amount: more than ₹0.",
      "amount",
    );
  const issuedOn = assertCalendarDate(
    input.issuedOn.trim(),
    "GUARANTEE_ISSUED_ON_INVALID",
  );
  if (daysBetween(context.today, issuedOn) > 0)
    throw field(
      "GUARANTEE_ISSUED_ON_IN_FUTURE",
      "The issue date cannot be after today.",
      "issuedOn",
    );
  const expiresOn = assertCalendarDate(
    input.expiresOn.trim(),
    "GUARANTEE_EXPIRES_ON_INVALID",
  );
  if (daysBetween(issuedOn, expiresOn) < 0)
    throw field(
      "GUARANTEE_EXPIRES_BEFORE_ISSUED",
      "The guarantee expires on or after its issue date.",
      "expiresOn",
    );
  const advanceId =
    purpose === "advance" ? (input.advanceId?.trim() ?? "") : "";
  if (purpose === "advance" && advanceId === "")
    throw field(
      "GUARANTEE_ADVANCE_REQUIRED",
      "Pick the advance this guarantee secures.",
      "advanceId",
    );
  return {
    purpose,
    number,
    bank,
    amount,
    issuedOn,
    expiresOn,
    advanceId: advanceId === "" ? null : advanceId,
    remarks: limitedText(input.remarks, "remarks", ADVANCE_REMARKS_MAX),
  };
}

/** The release of a guarantee: on or after its issue date, not after today. */
export function guaranteeReleaseDate(
  raw: string,
  context: { issuedOn: CalendarDate | null; today: CalendarDate },
): CalendarDate {
  const date = assertCalendarDate(raw.trim(), "RELEASED_ON_INVALID");
  if (daysBetween(context.today, date) > 0)
    throw field(
      "RELEASED_ON_IN_FUTURE",
      "The release date cannot be after today.",
      "releasedOn",
    );
  if (context.issuedOn != null && daysBetween(context.issuedOn, date) < 0)
    throw field(
      "RELEASED_ON_BEFORE_ISSUED",
      "The guarantee is released on or after its issue date.",
      "releasedOn",
    );
  return date;
}

export type GuaranteeStatus = "live" | "expired" | "released";

export function guaranteeStatus(
  guarantee: { expiresOn: CalendarDate; releasedOn: CalendarDate | null },
  on: CalendarDate,
): GuaranteeStatus {
  if (guarantee.releasedOn != null) return "released";
  return daysBetween(on, guarantee.expiresOn) < 0 ? "expired" : "live";
}

/** The fixed decimal `"10.00"` of a percent recovery, or paise of a fixed one, for the API. */
export function recoveryPercentText(value: bigint): string {
  const whole = value / 100n;
  const fraction = (value % 100n).toString().padStart(2, "0");
  return `${whole.toString()}.${fraction}`;
}
