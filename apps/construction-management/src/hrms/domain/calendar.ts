import {
  addDays,
  assertCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";

/**
 * Calendar helpers the hrms context shares: ISO weekdays for working days,
 * shifts and rotations, and `YYYY-MM` month keys for salary runs, month
 * locks and leave accrual periods. Dates are calendar dates in the Company
 * time zone (`shared-kernel/calendar-date`).
 */

/** 1 = Monday … 7 = Sunday (ISO 8601), as HRMS Settings store working days. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const ISO_WEEKDAYS: readonly IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7];

export const ISO_WEEKDAY_LABELS: Record<IsoWeekday, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

export function isIsoWeekday(value: number): value is IsoWeekday {
  return Number.isInteger(value) && value >= 1 && value <= 7;
}

/** The ISO weekday of a calendar date. */
export function isoWeekday(date: CalendarDate): IsoWeekday {
  const day = new Date(`${assertCalendarDate(date)}T00:00:00.000Z`).getUTCDay();
  // getUTCDay: 0 = Sunday … 6 = Saturday.
  return (day === 0 ? 7 : day) as IsoWeekday;
}

/** A month, `YYYY-MM`: a salary run, a month lock, an accrual period. */
export type MonthKey = string;

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isMonthKey(value: string): boolean {
  return MONTH_RE.test(value);
}

export function assertMonthKey(
  value: string,
  code = "MONTH_INVALID",
): MonthKey {
  if (!isMonthKey(value))
    throw new DomainError(code, `"${value}" is not a month (YYYY-MM).`);
  return value;
}

function parts(month: MonthKey): { year: number; month: number } {
  const match = MONTH_RE.exec(assertMonthKey(month));
  return { year: Number(match?.[1]), month: Number(match?.[2]) };
}

/** The month a date falls in. */
export function monthKeyOf(date: CalendarDate): MonthKey {
  return assertCalendarDate(date).slice(0, 7);
}

/** 1 = January … 12 = December. */
export function monthNumber(month: MonthKey): number {
  return parts(month).month;
}

export function daysInMonth(month: MonthKey): number {
  const { year, month: number } = parts(month);
  return new Date(Date.UTC(year, number, 0)).getUTCDate();
}

export function firstDayOf(month: MonthKey): CalendarDate {
  return `${assertMonthKey(month)}-01`;
}

export function lastDayOf(month: MonthKey): CalendarDate {
  return `${assertMonthKey(month)}-${String(daysInMonth(month)).padStart(2, "0")}`;
}

/** Every date of the month, in order. */
export function datesOf(month: MonthKey): CalendarDate[] {
  const first = firstDayOf(month);
  return Array.from({ length: daysInMonth(month) }, (_, index) =>
    addDays(first, index),
  );
}

/** `months` later (negative for earlier). */
export function addMonths(month: MonthKey, months: number): MonthKey {
  const { year, month: number } = parts(month);
  const index = year * 12 + (number - 1) + months;
  const nextYear = Math.floor(index / 12);
  const nextMonth = index - nextYear * 12 + 1;
  return `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}`;
}
