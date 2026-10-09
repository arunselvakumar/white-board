import {
  addDays,
  assertCalendarDate,
  daysBetween,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";

/** A date range report covers at most a year (CM-217). */
export const MAX_REPORT_DAYS = 366;

export type DateRange = { from: CalendarDate; to: CalendarDate };

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Checks `from ≤ to` and at most `MAX_REPORT_DAYS` days. */
export function checkRange(range: DateRange): DateRange {
  const from = assertCalendarDate(range.from, "REPORT_PERIOD_INVALID");
  const to = assertCalendarDate(range.to, "REPORT_PERIOD_INVALID");
  if (to < from)
    throw new DomainError(
      "REPORT_PERIOD_INVALID",
      "The period must end on or after the day it starts.",
    );
  if (daysBetween(from, to) + 1 > MAX_REPORT_DAYS)
    throw new DomainError(
      "REPORT_PERIOD_TOO_LONG",
      `A report covers at most ${String(MAX_REPORT_DAYS)} days.`,
    );
  return { from, to };
}

/** `YYYY-MM` as its first and last day. */
export function monthRange(month: string): DateRange {
  const match = MONTH_RE.exec(month);
  if (match == null)
    throw new DomainError("REPORT_PERIOD_INVALID", "Use a month as YYYY-MM.");
  const year = Number(match[1]);
  const index = Number(match[2]);
  const last = new Date(Date.UTC(year, index, 0)).getUTCDate();
  return {
    from: `${month}-01`,
    to: `${month}-${String(last).padStart(2, "0")}`,
  };
}

/** Every date from `from` to `to`, inclusive. */
export function datesIn({ from, to }: DateRange): CalendarDate[] {
  const dates: CalendarDate[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) dates.push(date);
  return dates;
}

/** `2026-09` → `September 2026`. */
export function monthLabel(month: string): string {
  const match = MONTH_RE.exec(month);
  if (match == null) return month;
  return `${MONTH_NAMES[Number(match[2]) - 1] ?? ""} ${match[1] ?? ""}`;
}

/** `2026-09-01` → `01 Sep 2026`. */
export function dateLabel(date: CalendarDate): string {
  const [year = "", month = "", day = ""] = date.split("-");
  const name = (MONTH_NAMES[Number(month) - 1] ?? "").slice(0, 3);
  return `${day} ${name} ${year}`;
}

export function rangeLabel({ from, to }: DateRange): string {
  return from === to
    ? dateLabel(from)
    : `${dateLabel(from)} to ${dateLabel(to)}`;
}
