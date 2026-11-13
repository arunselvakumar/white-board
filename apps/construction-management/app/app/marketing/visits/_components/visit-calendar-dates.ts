import {
  addDays,
  isCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";

/** The Visits page's two layouts, and the calendar's two spans. */
export const VISIT_VIEWS = ["list", "calendar"] as const;
export type VisitView = (typeof VISIT_VIEWS)[number];
export const CALENDAR_SPANS = ["month", "week"] as const;
export type CalendarSpan = (typeof CALENDAR_SPANS)[number];

const utc = (date: CalendarDate) => new Date(`${date}T00:00:00.000Z`);

/** The Monday on or before `date`; weeks run Monday to Sunday. */
export function weekStart(date: CalendarDate): CalendarDate {
  return addDays(date, -((utc(date).getUTCDay() + 6) % 7));
}

/** `YYYY-MM-01` of the month `date` is in. */
function monthStart(date: CalendarDate): CalendarDate {
  return `${date.slice(0, 7)}-01`;
}

/** The first of the month `months` away from `date`'s. */
function addMonths(date: CalendarDate, months: number): CalendarDate {
  const at = utc(monthStart(date));
  at.setUTCMonth(at.getUTCMonth() + months);
  return at.toISOString().slice(0, 10);
}

/**
 * The days a span shows around `day`: Monday to Sunday for a week; for a
 * month, whole weeks from the Monday on or before the 1st to the Sunday on
 * or after its last day.
 */
export function calendarDays(
  span: CalendarSpan,
  day: CalendarDate,
): CalendarDate[] {
  const from = weekStart(span === "week" ? day : monthStart(day));
  const to =
    span === "week"
      ? addDays(from, 6)
      : addDays(weekStart(addDays(addMonths(day, 1), -1)), 6);
  const days: CalendarDate[] = [];
  for (let at = from; at <= to; at = addDays(at, 1)) days.push(at);
  return days;
}

/**
 * The day previous or next lands on: a week either way, or the first of
 * the month before or after (today when that month holds it).
 */
export function shiftDay(
  span: CalendarSpan,
  day: CalendarDate,
  step: -1 | 1,
  today: CalendarDate,
): CalendarDate {
  if (span === "week") return addDays(day, 7 * step);
  const first = addMonths(day, step);
  return first.slice(0, 7) === today.slice(0, 7) ? today : first;
}

/** The address's `day`, or today when it is missing or not a date. */
export function chosenDay(
  value: string | null | undefined,
  today: CalendarDate,
): CalendarDate {
  return value != null && isCalendarDate(value) ? value : today;
}

const MONTH = new Intl.DateTimeFormat("en-IN", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const DAY_MONTH = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const FULL = new Intl.DateTimeFormat("en-IN", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});
const WEEKDAY = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  timeZone: "UTC",
});

/** "November 2026", or a week as "9 Nov – 15 Nov 2026". */
export function spanTitle(span: CalendarSpan, day: CalendarDate): string {
  if (span === "month") return MONTH.format(utc(day));
  const days = calendarDays("week", day);
  const first = days[0] ?? day;
  const last = days.at(-1) ?? day;
  return `${DAY_MONTH.format(utc(first))} – ${DAY_MONTH.format(utc(last))} ${last.slice(0, 4)}`;
}

/** "Thursday, 12 November". */
export function dayWords(day: CalendarDate): string {
  return FULL.format(utc(day));
}

/** "Thu". */
export function weekdayWord(day: CalendarDate): string {
  return WEEKDAY.format(utc(day));
}

/** Monday to Sunday, for the month's header row. */
export const WEEKDAYS = calendarDays("week", "2026-11-09").map(weekdayWord);
