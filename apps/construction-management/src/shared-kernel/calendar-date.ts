import { DomainError } from "./domain-error";

/**
 * A calendar date, `YYYY-MM-DD`, with no time and no time zone. Entry dates,
 * the Financial Closing Date and fiscal years are calendar dates in the
 * Company's time zone: compare dates, never instants.
 */
export type CalendarDate = string;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Days since 1970-01-01, or null when `value` is not a real date. */
function dayNumber(value: string): number | null {
  const match = DATE_RE.exec(value);
  if (match == null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const time = Date.UTC(year, month - 1, day);
  const back = new Date(time);
  if (
    back.getUTCFullYear() !== year ||
    back.getUTCMonth() !== month - 1 ||
    back.getUTCDate() !== day
  )
    return null;
  return time / 86_400_000;
}

export function isCalendarDate(value: string): boolean {
  return dayNumber(value) != null;
}

export function assertCalendarDate(
  value: string,
  code = "DATE_INVALID",
): CalendarDate {
  if (!isCalendarDate(value))
    throw new DomainError(code, `"${value}" is not a date (YYYY-MM-DD).`);
  return value;
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: CalendarDate, to: CalendarDate): number {
  const start = dayNumber(assertCalendarDate(from));
  const end = dayNumber(assertCalendarDate(to));
  return (end ?? 0) - (start ?? 0);
}

export function addDays(date: CalendarDate, days: number): CalendarDate {
  const start = dayNumber(assertCalendarDate(date)) ?? 0;
  return new Date((start + days) * 86_400_000).toISOString().slice(0, 10);
}

/** Today in an IANA time zone (`Asia/Kolkata` for most Companies). */
export function todayIn(
  timeZone: string,
  now: Date = new Date(),
): CalendarDate {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** A Postgres `date` column read by Prisma (UTC midnight) as a calendar date. */
export function calendarDateFromDb(value: Date): CalendarDate {
  return value.toISOString().slice(0, 10);
}

/** A calendar date for a Postgres `date` column written by Prisma. */
export function calendarDateToDb(value: CalendarDate): Date {
  return new Date(`${assertCalendarDate(value)}T00:00:00.000Z`);
}
