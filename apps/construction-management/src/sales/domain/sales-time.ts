import {
  addDays,
  assertCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";

/**
 * The Company's wall clock for sales (CM-1003, CM-1004). Next follow-ups
 * and follow-ups' Done on are a date and an optional `HH:MM` in the
 * Company time zone, stored as instants: a date without a time is stored
 * as its local midnight and counts as the whole day.
 */

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isSalesTime(value: string): boolean {
  return TIME_RE.test(value);
}

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

/** The instant a date and `HH:MM` (midnight when null) name in the zone. */
export function salesInstant(
  date: CalendarDate,
  time: string | null,
  timeZone: string,
): Date {
  assertCalendarDate(date);
  const match = TIME_RE.exec(time ?? "00:00");
  if (match == null) throw new RangeError(`Not a time: ${String(time)}`);
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  const [year, month, day] = date.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const guess = Date.UTC(year, month - 1, day, 0, minutes);
  const first = guess - offsetAt(guess, timeZone);
  return new Date(guess - offsetAt(first, timeZone));
}

/** The date and `HH:MM` of an instant in the zone. */
export function salesLocal(
  instant: Date,
  timeZone: string,
): { date: CalendarDate; time: string } {
  const p = parts(instant, timeZone);
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return {
    date: `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`,
    time: `${pad(p.hour)}:${pad(p.minute)}`,
  };
}

/** A next follow-up as stored. */
export type StoredFollowUpAt = { at: Date; hasTime: boolean };

/** A date and optional time as screens send and show them. */
export type SalesDateTime = { date: CalendarDate; time: string | null };

export function toStoredFollowUpAt(
  value: SalesDateTime | null,
  timeZone: string,
): StoredFollowUpAt | null {
  if (value == null) return null;
  return {
    at: salesInstant(value.date, value.time, timeZone),
    hasTime: value.time != null,
  };
}

export function fromStoredFollowUpAt(
  value: { at: Date | null; hasTime: boolean },
  timeZone: string,
): SalesDateTime | null {
  if (value.at == null) return null;
  const local = salesLocal(value.at, timeZone);
  return { date: local.date, time: value.hasTime ? local.time : null };
}

/** Where "now" and the Company's today fall, for the Due filter (CM-0022 §4). */
export type DueBounds = {
  now: Date;
  /** Local midnight starting today. */
  todayStart: Date;
  /** Local midnight starting tomorrow. */
  tomorrowStart: Date;
};

export function dueBounds(
  now: Date,
  today: CalendarDate,
  timeZone: string,
): DueBounds {
  return {
    now,
    todayStart: salesInstant(today, null, timeZone),
    tomorrowStart: salesInstant(addDays(today, 1), null, timeZone),
  };
}
