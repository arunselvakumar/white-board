import {
  assertCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import {
  conflict,
  DomainError,
  forbidden,
} from "@/src/shared-kernel/domain-error";

import { addMonths, monthKeyOf, type MonthKey } from "./calendar";
import { esiContributionPeriod, isEsiEligible } from "./salary-calculation";
import type { EsiRate } from "./statutory";

/**
 * The life of a salary slip (CM-316, `modules/10` §8): Calculated (may be
 * recalculated) → Approved (locks the member's month, ADR CM-0012 §17) →
 * Paid (mode, date, reference; CM-0012 §16). An advance slip (CM-0012 §15)
 * is paid when it is recorded and never changes. Approved and Paid slips
 * never change (ADR CM-0008).
 */

export const SALARY_SLIP_STATUSES = ["calculated", "approved", "paid"] as const;
export type SalarySlipStatus = (typeof SALARY_SLIP_STATUSES)[number];

export const SALARY_SLIP_KINDS = ["regular", "advance"] as const;
export type SalarySlipKind = (typeof SALARY_SLIP_KINDS)[number];

export const PAYMENT_MODES = ["cash", "bank"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

/** What the state rules need to know about a slip. */
export type SalarySlipState = {
  memberId: string;
  month: MonthKey;
  kind: SalarySlipKind;
  status: SalarySlipStatus;
};

/** Who approves: their Team Member (null when they have none) and whether they are the Owner. */
export type SalaryApprover = { memberId: string | null; isOwner: boolean };

/** One amount on a slip or an advance fits a 32-bit column (ADR CM-0004). */
export const MAX_SALARY_AMOUNT = 2_000_000_000;

export const MAX_ADVANCE_INSTALMENTS = 24;
export const MAX_PAYMENT_REFERENCE = 100;
export const MAX_ADVANCE_REASON = 500;

function invalid(code: string, message: string, field: string): DomainError {
  return new DomainError(code, message, { details: { field } });
}

/** 409: someone approved or paid it, so it no longer changes. */
export function salarySlipNotCalculated(month: MonthKey): DomainError {
  return conflict(
    "SALARY_SLIP_NOT_CALCULATED",
    `This salary for ${month} is already approved, so it cannot change. Make corrections in the next month.`,
    { month },
  );
}

/** 409: the slip changed since it was loaded. */
export function salarySlipChanged(slipIds: readonly string[]): DomainError {
  return conflict(
    "SALARY_SLIP_CHANGED",
    "Someone else changed this salary after you opened it. Reload to see their changes.",
    { slipIds },
  );
}

/** A Calculated regular slip is the only one recalculation may replace. */
export function assertRecalculable(slip: SalarySlipState): void {
  if (slip.kind !== "regular" || slip.status !== "calculated")
    throw salarySlipNotCalculated(slip.month);
}

/**
 * Approve: a Calculated regular slip, by anyone with approve on
 * `hrms.salaries` except the member it pays (the Owner may approve their
 * own, ADR CM-0012 §5).
 */
export function assertApprovable(
  slip: SalarySlipState,
  approver: SalaryApprover,
): void {
  if (!approver.isOwner && approver.memberId === slip.memberId)
    throw forbidden(
      "SALARY_OWN_SLIP",
      "You cannot approve your own salary. Another approver must.",
    );
  if (slip.kind !== "regular" || slip.status !== "calculated")
    throw conflict(
      "SALARY_SLIP_ALREADY_APPROVED",
      `This salary for ${slip.month} is already approved.`,
      { month: slip.month },
    );
}

/** Mark Paid: only an Approved regular slip (`modules/10` business rules). */
export function assertPayable(slip: SalarySlipState): void {
  if (slip.kind !== "regular" || slip.status === "paid")
    throw conflict(
      "SALARY_ALREADY_PAID",
      `This salary for ${slip.month} is already paid.`,
      { month: slip.month },
    );
  if (slip.status !== "approved")
    throw conflict(
      "SALARY_NOT_APPROVED",
      "Approve this salary before marking it paid.",
      { month: slip.month },
    );
}

export type SalaryPayment = {
  mode: PaymentMode;
  date: CalendarDate;
  reference: string | null;
};

function paymentDate(value: string, today: CalendarDate): CalendarDate {
  let date: CalendarDate;
  try {
    date = assertCalendarDate(value.trim());
  } catch {
    throw invalid(
      "PAYMENT_DATE_INVALID",
      "Enter the date it was paid.",
      "paymentDate",
    );
  }
  if (date > today)
    throw invalid(
      "PAYMENT_DATE_IN_FUTURE",
      "The payment date cannot be in the future.",
      "paymentDate",
    );
  return date;
}

function reference(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  if (text.length > MAX_PAYMENT_REFERENCE)
    throw invalid(
      "PAYMENT_REFERENCE_TOO_LONG",
      `Keep the reference to ${String(MAX_PAYMENT_REFERENCE)} characters.`,
      "reference",
    );
  return text.length === 0 ? null : text;
}

/** Mode (Cash or Bank), a date not after today, an optional reference. */
export function createSalaryPayment(
  input: { mode: string; paymentDate: string; reference?: string | null },
  today: CalendarDate,
): SalaryPayment {
  if (!(PAYMENT_MODES as readonly string[]).includes(input.mode))
    throw invalid("PAYMENT_MODE_INVALID", "Choose Cash or Bank.", "mode");
  return {
    mode: input.mode as PaymentMode,
    date: paymentDate(input.paymentDate, today),
    reference: reference(input.reference),
  };
}

// ---------------------------------------------------------------------------
// Advance salary (ADR CM-0012 §15)
// ---------------------------------------------------------------------------

export type SalaryAdvanceTerms = {
  amount: number;
  instalments: number;
  advanceDate: CalendarDate;
  reason: string | null;
  payment: SalaryPayment;
};

/**
 * An advance: a whole number of paise above 0 (at most ₹2 crore), 1–24
 * instalments (default 1), a date not after today, and how it was paid.
 */
export function createSalaryAdvance(
  input: {
    amount: number;
    instalments?: number | null;
    advanceDate: string;
    reason?: string | null;
    mode: string;
    reference?: string | null;
  },
  today: CalendarDate,
): SalaryAdvanceTerms {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0)
    throw invalid(
      "ADVANCE_AMOUNT_INVALID",
      "Enter an amount above zero.",
      "amount",
    );
  if (input.amount > MAX_SALARY_AMOUNT)
    throw invalid(
      "AMOUNT_TOO_LARGE",
      "An advance can be at most ₹2,00,00,000.",
      "amount",
    );
  const instalments = input.instalments ?? 1;
  if (
    !Number.isInteger(instalments) ||
    instalments < 1 ||
    instalments > MAX_ADVANCE_INSTALMENTS
  )
    throw invalid(
      "ADVANCE_INSTALMENTS_INVALID",
      `Recover it in 1 to ${String(MAX_ADVANCE_INSTALMENTS)} instalments.`,
      "instalments",
    );
  if (instalments > input.amount)
    throw invalid(
      "ADVANCE_INSTALMENTS_INVALID",
      "Each instalment must be at least one paisa.",
      "instalments",
    );
  const payment = createSalaryPayment(
    {
      mode: input.mode,
      paymentDate: input.advanceDate,
      reference: input.reference,
    },
    today,
  );
  const reason = input.reason?.trim() ?? "";
  if (reason.length > MAX_ADVANCE_REASON)
    throw invalid(
      "ADVANCE_REASON_TOO_LONG",
      `Keep the reason to ${String(MAX_ADVANCE_REASON)} characters.`,
      "reason",
    );
  return {
    amount: input.amount,
    instalments,
    advanceDate: payment.date,
    reason: reason.length === 0 ? null : reason,
    payment,
  };
}

/** One instalment: the amount over the instalments, rounded up to the paisa. */
export function advanceInstalment(amount: number, instalments: number): number {
  return Math.ceil(amount / instalments);
}

/**
 * The first month an advance is recovered: the month it was paid in,
 * unless that month's regular salary is already approved, then the next.
 */
export function firstRecoveryMonth(
  advanceDate: CalendarDate,
  monthAlreadyApproved: boolean,
): MonthKey {
  const month = monthKeyOf(advanceDate);
  return monthAlreadyApproved ? addMonths(month, 1) : month;
}

export type AdvanceForRecovery = {
  id: string;
  amount: number;
  instalments: number;
  firstRecoveryMonth: MonthKey;
};

/**
 * What a regular slip of `month` recovers of an advance: one instalment,
 * never more than is still outstanding after the slips of earlier months
 * (`recoveredBefore`). What the net-pay rule cut in a month stays
 * outstanding, so the advance runs on past its instalments until it is
 * recovered.
 */
export function advanceDue(
  advance: AdvanceForRecovery,
  month: MonthKey,
  recoveredBefore: number,
): number {
  if (month < advance.firstRecoveryMonth) return 0;
  const outstanding = Math.max(0, advance.amount - recoveredBefore);
  return Math.min(
    advanceInstalment(advance.amount, advance.instalments),
    outstanding,
  );
}

// ---------------------------------------------------------------------------
// ESI eligibility for the contribution period (ADR CM-0008)
// ---------------------------------------------------------------------------

export type EsiEligibility = {
  eligible: boolean;
  /** The month whose full-month gross decided it. */
  basisMonth: MonthKey;
  /** Full-month gross (rate of wages, overtime excluded), paise. */
  basisGross: number;
};

/**
 * Eligibility for the period holding `month`: decided by the full-month
 * gross (the rate of wages, without overtime or proration) of the member's
 * first regular slip in the period, or this month's when this is their
 * first slip of the period (a joiner, or the period's first month).
 */
export function esiEligibilityFor(input: {
  month: MonthKey;
  periodFirstSlip: { month: MonthKey; fullMonthGross: number } | null;
  fullMonthGross: number;
  rate: EsiRate | null;
}): EsiEligibility {
  const period = esiContributionPeriod(input.month);
  const first =
    input.periodFirstSlip != null &&
    input.periodFirstSlip.month >= period.start &&
    input.periodFirstSlip.month < input.month
      ? input.periodFirstSlip
      : { month: input.month, fullMonthGross: input.fullMonthGross };
  return {
    eligible: isEsiEligible(first.fullMonthGross, input.rate),
    basisMonth: first.month,
    basisGross: first.fullMonthGross,
  };
}
