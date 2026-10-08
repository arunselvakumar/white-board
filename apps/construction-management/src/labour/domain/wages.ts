import {
  addDays,
  assertCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import {
  divideRounded,
  parseDecimal,
  pow10,
} from "@/src/shared-kernel/decimal";
import { DomainError } from "@/src/shared-kernel/domain-error";

export type WageType = "daily" | "monthly";

export type AttendanceStatus =
  "present" | "half_day" | "absent" | "on_leave" | "holiday";

export const ATTENDANCE_STATUSES: readonly AttendanceStatus[] = [
  "present",
  "half_day",
  "absent",
  "on_leave",
  "holiday",
];

/** 0 = Sunday … 6 = Saturday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export function weekdayOf(date: CalendarDate): Weekday {
  return new Date(
    `${assertCalendarDate(date)}T00:00:00Z`,
  ).getUTCDay() as Weekday;
}

export function daysInMonth(date: CalendarDate): number {
  const [year = 0, month = 0] = assertCalendarDate(date).split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * How much of a day's wage a status pays, in halves (2 = a full day). Owner
 * decisions 2026-10-08 (`modules/08`, "Decisions for the build"): a daily
 * wage pays no Holiday or weekly off unless the day is Paid Leave; a
 * monthly wage pays Holidays (weekly offs are marked Holiday).
 */
export function paidHalves(
  wageType: WageType,
  status: AttendanceStatus,
  isPaidLeave: boolean,
): 0 | 1 | 2 {
  switch (status) {
    case "present":
      return 2;
    case "half_day":
      return 1;
    case "absent":
      return 0;
    case "on_leave":
      return isPaidLeave ? 2 : 0;
    case "holiday":
      return wageType === "monthly" ? 2 : 0;
  }
}

/**
 * What one attendance day pays before overtime, in paise, rounded half up.
 * A monthly wage is prorated by the calendar days in that month.
 */
export function dayEarned(input: {
  wageType: WageType;
  /** Paise: wage per day (daily) or per month (monthly). */
  wageRate: number;
  status: AttendanceStatus;
  isPaidLeave: boolean;
  date: CalendarDate;
}): number {
  const halves = BigInt(
    paidHalves(input.wageType, input.status, input.isPaidLeave),
  );
  const days =
    input.wageType === "monthly" ? BigInt(daysInMonth(input.date)) : 1n;
  return Number(divideRounded(BigInt(input.wageRate) * halves, 2n * days));
}

export const MAX_OVERTIME_HOURS_PER_DAY = 24;

/**
 * Overtime hours as an exact decimal string with at most two places,
 * `0 < hours ≤ 24`.
 */
export function overtimeHours(raw: string | number): string {
  let parsed: { numerator: bigint; scale: number };
  try {
    parsed = parseDecimal(raw);
  } catch {
    throw invalidHours();
  }
  if (parsed.scale > 2) throw invalidHours();
  const hundredths = divideRounded(
    parsed.numerator * 100n,
    pow10(parsed.scale),
  );
  if (hundredths <= 0n || hundredths > BigInt(MAX_OVERTIME_HOURS_PER_DAY * 100))
    throw invalidHours();
  return formatHundredths(hundredths);
}

function invalidHours(): DomainError {
  return new DomainError(
    "OVERTIME_HOURS_INVALID",
    "Overtime hours must be more than 0 and at most 24, in steps of 0.01.",
  );
}

/** Total of several overtime hour strings, as hundredths of an hour. */
export function hoursInHundredths(hours: string): number {
  const { numerator, scale } = parseDecimal(hours);
  return Number(divideRounded(numerator * 100n, pow10(scale)));
}

function formatHundredths(value: bigint): string {
  const whole = value / 100n;
  const fraction = value % 100n;
  if (fraction === 0n) return whole.toString();
  return `${whole.toString()}.${fraction.toString().padStart(2, "0").replace(/0$/, "")}`;
}

/** Paise for `hours` (decimal string) at `ratePerHour` paise, rounded half up. */
export function overtimeAmount(hours: string, ratePerHour: number): number {
  const { numerator, scale } = parseDecimal(hours);
  return Number(divideRounded(BigInt(ratePerHour) * numerator, pow10(scale)));
}

/**
 * Vendor pay for one line: full × rate + half × rate ÷ 2 + overtime hours ×
 * overtime rate, rounded half up once.
 */
export function vendorLineAmount(input: {
  fullDayCount: number;
  halfDayCount: number;
  overtimeHours: string;
  ratePerDay: number;
  overtimePerHour: number;
}): number {
  const { numerator, scale } = parseDecimal(input.overtimeHours);
  const denominator = 2n * pow10(scale);
  const days =
    BigInt(input.ratePerDay) *
    (2n * BigInt(input.fullDayCount) + BigInt(input.halfDayCount)) *
    pow10(scale);
  const overtime = BigInt(input.overtimePerHour) * numerator * 2n;
  return Number(divideRounded(days + overtime, denominator));
}

/** Every date from `from` to `to`, inclusive. */
export function datesBetween(
  from: CalendarDate,
  to: CalendarDate,
): CalendarDate[] {
  const dates: CalendarDate[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) dates.push(date);
  return dates;
}
