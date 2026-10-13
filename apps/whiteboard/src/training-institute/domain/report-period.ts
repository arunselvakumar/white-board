// Report periods (Reports PRD §6.3). Dates are local calendar dates
// (YYYY-MM-DD) in the institute's time zone. Keep this file free of
// server-only imports: the Reports screens use the presets too.

import { addCalendarDays, isCalendarDate, weekdayOf } from "./class-schedule";
import { DomainError } from "./errors";

export const REPORT_PERIOD_PRESETS = [
  "today",
  "yesterday",
  "this_week",
  "last_week",
  "this_month",
  "last_month",
  "this_quarter",
  "this_financial_year",
  "last_financial_year",
  "this_academic_year",
  "custom",
] as const;

export type ReportPeriodPreset = (typeof REPORT_PERIOD_PRESETS)[number];

export const REPORT_PERIOD_LABELS: Record<ReportPeriodPreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  this_week: "This week",
  last_week: "Last week",
  this_month: "This month",
  last_month: "Last month",
  this_quarter: "This quarter",
  this_financial_year: "This financial year",
  last_financial_year: "Last financial year",
  this_academic_year: "This academic year",
  custom: "Custom range",
};

/** The longest custom range: two years covers a financial year either side. */
export const MAX_REPORT_PERIOD_DAYS = 731;

export type ReportPeriod = {
  preset: ReportPeriodPreset;
  from: string;
  to: string;
};

function monthStart(year: number, month: number): string {
  // `month` may run past 1–12; Date.UTC rolls the year over.
  return new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10);
}

function monthEnd(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function parts(date: string): { year: number; month: number } {
  return { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) };
}

/** First and last date of the month "YYYY-MM". */
export function monthRange(month: string): { from: string; to: string } {
  const { year, month: value } = parts(`${month}-01`);
  return { from: monthStart(year, value), to: monthEnd(year, value) };
}

/** "YYYY-MM" `count` months before (negative: after) `month`. */
export function shiftMonth(month: string, count: number): string {
  const { year, month: value } = parts(`${month}-01`);
  return monthStart(year, value - count).slice(0, 7);
}

/** Every "YYYY-MM" that a period touches, oldest first. */
export function monthsIn(from: string, to: string): string[] {
  const months: string[] = [];
  let month = from.slice(0, 7);
  while (month <= to.slice(0, 7)) {
    months.push(month);
    month = shiftMonth(month, -1);
  }
  return months;
}

/** The financial year (1 Apr – 31 Mar) holding `date`. */
export function financialYear(date: string): { from: string; to: string } {
  const { year, month } = parts(date);
  const start = month >= 4 ? year : year - 1;
  return { from: `${String(start)}-04-01`, to: `${String(start + 1)}-03-31` };
}

/** The academic year holding `date`, starting on the 1st of `startMonth`. */
export function academicYear(
  date: string,
  startMonth: number,
): { from: string; to: string } {
  const { year, month } = parts(date);
  const start = month >= startMonth ? year : year - 1;
  return {
    from: monthStart(start, startMonth),
    to: monthEnd(start + 1, startMonth - 1),
  };
}

/** Monday of the week holding `date`. */
export function weekStart(date: string): string {
  return addCalendarDays(date, -((weekdayOf(date) + 6) % 7));
}

/**
 * The dates a preset covers on `today`. A custom range needs both dates, in
 * order, at most MAX_REPORT_PERIOD_DAYS long.
 */
export function resolveReportPeriod(input: {
  preset: ReportPeriodPreset;
  today: string;
  academicYearStartMonth: number;
  from?: string | null;
  to?: string | null;
}): ReportPeriod {
  const { today, preset } = input;
  const { year, month } = parts(today);
  const range = ((): { from: string; to: string } => {
    switch (preset) {
      case "today":
        return { from: today, to: today };
      case "yesterday": {
        const day = addCalendarDays(today, -1);
        return { from: day, to: day };
      }
      case "this_week": {
        const from = weekStart(today);
        return { from, to: addCalendarDays(from, 6) };
      }
      case "last_week": {
        const from = addCalendarDays(weekStart(today), -7);
        return { from, to: addCalendarDays(from, 6) };
      }
      case "this_month":
        return { from: monthStart(year, month), to: monthEnd(year, month) };
      case "last_month":
        return {
          from: monthStart(year, month - 1),
          to: monthEnd(year, month - 1),
        };
      case "this_quarter": {
        const first = month - ((month - 1) % 3);
        return { from: monthStart(year, first), to: monthEnd(year, first + 2) };
      }
      case "this_financial_year":
        return financialYear(today);
      case "last_financial_year":
        return financialYear(`${String(year - 1)}-${today.slice(5)}`);
      case "this_academic_year":
        return academicYear(today, input.academicYearStartMonth);
      case "custom": {
        const from = input.from ?? "";
        const to = input.to ?? "";
        if (!isCalendarDate(from) || !isCalendarDate(to))
          throw new DomainError(
            "REPORT_PERIOD_INVALID",
            "Choose a start and end date for a custom range.",
          );
        if (to < from)
          throw new DomainError(
            "REPORT_PERIOD_INVALID",
            "The end date must be on or after the start date.",
          );
        const days =
          (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
            86_400_000 +
          1;
        if (days > MAX_REPORT_PERIOD_DAYS)
          throw new DomainError(
            "REPORT_PERIOD_TOO_LONG",
            "A custom range can be at most two years.",
          );
        return { from, to };
      }
    }
  })();
  return { preset, ...range };
}

/** The part of a period up to today, or null when it is all in the future. */
export function untilToday(
  period: { from: string; to: string },
  today: string,
): { from: string; to: string } | null {
  if (period.from > today) return null;
  return { from: period.from, to: period.to < today ? period.to : today };
}
