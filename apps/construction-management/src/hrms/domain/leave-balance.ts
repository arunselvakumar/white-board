import {
  addDays,
  assertCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";

import { addMonths, monthKeyOf, type MonthKey } from "./calendar";
import type { HrmsSettings } from "./hrms-settings";
import {
  fromHundredths,
  hasTwoDecimals,
  minDays,
  subtractDays,
  sumDays,
  toHundredths,
} from "./leave-days";
import type { LeaveType } from "./leave-type";
import { leaveYearOf, type LeaveYear } from "./leave-year";

/**
 * Leave balances are never stored (ADR CM-0004): a balance is the sum of
 * a member's append-only leave ledger entries for one leave type and one
 * leave year (CM-311). Credits are positive (initial, accrual, carry
 * forward, released, restored, a positive adjustment); debits negative
 * (reserved, used, a negative adjustment). Applying reserves; approval
 * releases the reservation and posts `used`; rejection and withdrawal
 * release; an approved cancellation restores.
 */

export const LEAVE_LEDGER_KINDS = [
  "initial",
  "accrual",
  "carry_forward",
  "adjustment",
  "used",
  "reserved",
  "released",
  "restored",
] as const;

export type LeaveLedgerKind = (typeof LEAVE_LEDGER_KINDS)[number];

/** The credit kinds shown as "credit history". */
export const LEAVE_CREDIT_KINDS: readonly LeaveLedgerKind[] = [
  "initial",
  "accrual",
  "carry_forward",
  "adjustment",
];

export type LeaveLedgerLine = Readonly<{
  kind: LeaveLedgerKind;
  /** Signed days. */
  days: number;
  /** `YYYY-MM` of an accrual. */
  periodKey?: string | null;
  entryDate?: CalendarDate;
}>;

/** One member's balance of one leave type in one leave year. */
export type LeaveBalance = Readonly<{
  /** False until the year's `initial` entry is posted. */
  initialised: boolean;
  /** The opening credit (the upfront entitlement, or 0). */
  opening: number;
  /** Monthly credits so far. */
  accrued: number;
  carriedForward: number;
  /** Net manager adjustments (Comp Off credits, corrections). */
  adjusted: number;
  /** Days taken on approved requests, net of cancellations. */
  used: number;
  /** Days held by pending requests. */
  pending: number;
  /** What can still be applied for: the sum of every entry. */
  available: number;
  /** The latest accrual period credited, `YYYY-MM`. */
  lastAccrualPeriod: string | null;
}>;

function sumOf(
  lines: readonly LeaveLedgerLine[],
  kinds: readonly LeaveLedgerKind[],
): number {
  return sumDays(
    lines.filter((line) => kinds.includes(line.kind)).map((line) => line.days),
  );
}

/** The balance the entries add up to. */
export function balanceOf(lines: readonly LeaveLedgerLine[]): LeaveBalance {
  const periods = lines
    .filter((line) => line.kind === "accrual" && line.periodKey != null)
    .map((line) => line.periodKey as string)
    .sort();
  return Object.freeze({
    initialised: lines.some((line) => line.kind === "initial"),
    opening: sumOf(lines, ["initial"]),
    accrued: sumOf(lines, ["accrual"]),
    carriedForward: sumOf(lines, ["carry_forward"]),
    adjusted: sumOf(lines, ["adjustment"]),
    used: -sumOf(lines, ["used", "restored"]) || 0,
    pending: -sumOf(lines, ["reserved", "released"]) || 0,
    available: sumDays(lines.map((line) => line.days)),
    lastAccrualPeriod: periods.at(-1) ?? null,
  });
}

/**
 * The opening credit when a balance is initialised (ADR CM-0012 §7): an
 * upfront type gets its whole entitlement; a monthly type starts at 0 and
 * earns its credits by accrual; a type with no credit starts at 0. No
 * pro-rating for a member who joins mid-year (M3 decision).
 */
export function openingCredit(
  type: Pick<LeaveType, "accrualMode">,
  entitlement: number,
): number {
  return type.accrualMode === "upfront" ? entitlement : 0;
}

/**
 * The days carried into a new leave year (ADR CM-0012 §6, `modules/10`
 * "Carry forward"): only when the Company's switch and the type's are both
 * on, the smaller of the unused days, the type's cap and the Company's
 * cap. Pending requests of the old year count as taken. Null when nothing
 * is carried (a switch is off, or the old year has no balance at all).
 */
export function carryForwardDays(input: {
  type: Pick<LeaveType, "carryForward" | "maxCarryForward">;
  settings: Pick<HrmsSettings, "carryForwardEnabled" | "carryForwardMaxDays">;
  /** The old year's available days; null when it had no entries. */
  previousAvailable: number | null;
}): number | null {
  const { type, settings, previousAvailable } = input;
  if (!settings.carryForwardEnabled || !type.carryForward) return null;
  if (previousAvailable == null) return null;
  return minDays(
    Math.max(0, previousAvailable),
    type.maxCarryForward ?? 0,
    settings.carryForwardMaxDays ?? 0,
  );
}

/** The leave year just before `year`, under the same setting. */
export function previousLeaveYear(
  year: LeaveYear,
  setting: HrmsSettings["leaveYear"],
): LeaveYear {
  return leaveYearOf(addDays(year.start, -1), setting);
}

export type AccrualCredit = Readonly<{
  periodKey: MonthKey;
  days: number;
  /** The accrual day of the period. */
  entryDate: CalendarDate;
}>;

/**
 * The monthly credits a periodic type still owes (CM-311, ADR CM-0012 §7):
 * one per month from `fromMonth` to the month of `today` (never past the
 * leave year's end) whose accrual day has come, skipping periods already
 * credited, each `credit_per_period` but never taking the year's accruals
 * past `entitlement` (the last one is cut short). Idempotent: running it
 * twice credits nothing the second time.
 */
export function accrualCredits(input: {
  type: Pick<LeaveType, "accrualMode" | "accrualDay" | "creditPerPeriod">;
  entitlement: number;
  /** The first month that earns a credit (the balance's start). */
  fromMonth: MonthKey;
  year: LeaveYear;
  today: CalendarDate;
  /** Periods credited already and the sum of those credits. */
  credited: ReadonlySet<string>;
  accruedSoFar: number;
}): AccrualCredit[] {
  const { type, year, today } = input;
  if (
    type.accrualMode !== "periodic" ||
    type.accrualDay == null ||
    type.creditPerPeriod == null
  )
    return [];
  assertCalendarDate(today);
  const yearFirst = monthKeyOf(year.start);
  const yearLast = monthKeyOf(year.end);
  const todayMonth = monthKeyOf(today);
  const last = todayMonth < yearLast ? todayMonth : yearLast;
  let month = input.fromMonth < yearFirst ? yearFirst : input.fromMonth;
  let remaining =
    toHundredths(input.entitlement) - toHundredths(input.accruedSoFar);
  const credits: AccrualCredit[] = [];
  const day = String(type.accrualDay).padStart(2, "0");
  while (month <= last && remaining > 0) {
    const entryDate = `${month}-${day}`;
    if (entryDate > today) break;
    if (!input.credited.has(month)) {
      const credit = Math.min(toHundredths(type.creditPerPeriod), remaining);
      credits.push(
        Object.freeze({
          periodKey: month,
          days: fromHundredths(credit),
          entryDate,
        }),
      );
      remaining -= credit;
    }
    month = addMonths(month, 1);
  }
  return credits;
}

export const ADJUSTMENT_LIMITS = {
  maxDays: 366,
  minReasonLength: 3,
  maxReasonLength: 500,
} as const;

/**
 * A manager's balance adjustment (CM-311, ADR CM-0012 §9: Comp Off is
 * credited this way): non-zero days, up to two decimals, with a reason. A
 * debit may not take the balance below zero.
 */
export function createAdjustment(input: {
  days: number;
  reason: string;
  available: number;
}): { days: number; reason: string } {
  const { maxDays, minReasonLength, maxReasonLength } = ADJUSTMENT_LIMITS;
  if (
    !hasTwoDecimals(input.days) ||
    input.days === 0 ||
    Math.abs(input.days) > maxDays
  )
    throw new DomainError(
      "LEAVE_ADJUSTMENT_DAYS_INVALID",
      `Enter days to credit (or a negative number to debit), up to ${String(maxDays)} and two decimals.`,
      { details: { field: "days" } },
    );
  const reason = input.reason.trim();
  if (reason.length < minReasonLength)
    throw new DomainError(
      "LEAVE_ADJUSTMENT_REASON_REQUIRED",
      "Say why the balance is adjusted.",
      { details: { field: "reason" } },
    );
  if (reason.length > maxReasonLength)
    throw new DomainError(
      "LEAVE_ADJUSTMENT_REASON_TOO_LONG",
      `Use at most ${String(maxReasonLength)} characters.`,
      { details: { field: "reason" } },
    );
  if (input.days < 0 && subtractDays(input.available, -input.days) < 0)
    throw new DomainError(
      "LEAVE_ADJUSTMENT_BELOW_ZERO",
      `Only ${String(input.available)} days are available to take away.`,
      { details: { field: "days", available: input.available } },
    );
  return { days: Math.round(input.days * 100) / 100, reason };
}

/**
 * Whether `requested` more days fit the balance (CM-312): unpaid leave
 * (Loss of Pay) needs no balance; a type that allows advance use may go
 * below zero by the credits still to come this year (entitlement minus
 * what was credited by initialisation and accrual); otherwise the
 * available days must cover it. Throws 400 `LEAVE_BALANCE_INSUFFICIENT`.
 */
export function assertBalanceCovers(input: {
  type: Pick<LeaveType, "name" | "isPaid" | "allowAdvanceUse">;
  balance: LeaveBalance;
  entitlement: number;
  requested: number;
}): void {
  const { type, balance, requested } = input;
  if (!type.isPaid) return;
  let floor = 0;
  if (type.allowAdvanceUse) {
    const toCome = subtractDays(
      input.entitlement,
      sumDays([balance.opening, balance.accrued]),
    );
    floor = -Math.max(0, toCome);
  }
  if (subtractDays(balance.available, requested) >= floor) return;
  const allowed = subtractDays(balance.available, floor);
  throw new DomainError(
    "LEAVE_BALANCE_INSUFFICIENT",
    balance.initialised
      ? `Only ${String(Math.max(0, allowed))} days of ${type.name} can be taken; this request needs ${String(requested)}.`
      : `There is no ${type.name} balance for this leave year yet. Ask your manager to initialise leave balances.`,
    {
      details: {
        field: "leaveTypeId",
        available: balance.available,
        requested,
      },
    },
  );
}
