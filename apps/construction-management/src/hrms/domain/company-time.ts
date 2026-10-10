import {
  assertCalendarDate,
  daysBetween,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";

import { minutesOf } from "./shift";

/**
 * Instants and the Company's wall clock (CM-308). Check-ins are instants;
 * attendance days, shift times and the times a member types for a
 * missed checkout or a back-dated day are dates and `HH:MM` in the
 * Company time zone (`Asia/Kolkata` for most Companies).
 */

/** A wall-clock moment in the Company time zone. */
export type LocalDateTime = {
  date: CalendarDate;
  /** Minutes after local midnight, 0–1439. */
  minutes: number;
};

const FORMATS = new Map<string, Intl.DateTimeFormat>();

function format(timeZone: string): Intl.DateTimeFormat {
  let found = FORMATS.get(timeZone);
  if (found == null) {
    found = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    FORMATS.set(timeZone, found);
  }
  return found;
}

function parts(instant: Date, timeZone: string) {
  const values: Record<string, string> = {};
  for (const part of format(timeZone).formatToParts(instant))
    values[part.type] = part.value;
  return {
    year: Number(values["year"]),
    month: Number(values["month"]),
    day: Number(values["day"]),
    hour: Number(values["hour"]),
    minute: Number(values["minute"]),
    second: Number(values["second"]),
  };
}

/** Where `instant` falls on the Company's wall clock. */
export function localDateTime(instant: Date, timeZone: string): LocalDateTime {
  const p = parts(instant, timeZone);
  return {
    date: `${String(p.year).padStart(4, "0")}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`,
    minutes: p.hour * 60 + p.minute,
  };
}

/** `HH:MM` of an instant on the Company's wall clock. */
export function localTime(instant: Date, timeZone: string): string {
  const { minutes } = localDateTime(instant, timeZone);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** The zone's offset from UTC at `instant`, milliseconds. */
function offsetAt(instant: number, timeZone: string): number {
  const p = parts(new Date(instant), timeZone);
  const asUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second,
  );
  return asUtc - (instant - (instant % 1000));
}

/**
 * The instant a date and `HH:MM` name on the Company's wall clock. In a
 * zone with daylight saving a time skipped by the change resolves to the
 * instant after it (India has none).
 */
export function instantAt(
  date: CalendarDate,
  time: string,
  timeZone: string,
): Date {
  assertCalendarDate(date);
  const minutes = minutesOf(time);
  const [year, month, day] = date.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const guess = Date.UTC(year, month - 1, day, 0, minutes);
  const first = guess - offsetAt(guess, timeZone);
  const second = guess - offsetAt(first, timeZone);
  return new Date(second);
}

/**
 * Minutes from the start (local midnight) of `day` to `instant`: above
 * 1,440 for an instant on the next date, as a night shift's checkout is.
 */
export function minutesIntoDay(
  day: CalendarDate,
  instant: Date,
  timeZone: string,
): number {
  const local = localDateTime(instant, timeZone);
  return daysBetween(day, local.date) * 1440 + local.minutes;
}
