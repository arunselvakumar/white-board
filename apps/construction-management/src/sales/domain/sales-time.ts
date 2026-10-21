import { addDays, type CalendarDate } from "@/src/shared-kernel/calendar-date";
import { zoneInstant, zoneParts } from "@/src/shared-kernel/zone-time";

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

/**
 * The instant a date and `HH:MM` (midnight when null) name in the zone. A
 * time skipped by a daylight-saving change is the first instant after it,
 * so a day still starts on that day where the change is at midnight.
 */
export function salesInstant(
  date: CalendarDate,
  time: string | null,
  timeZone: string,
): Date {
  const match = TIME_RE.exec(time ?? "00:00");
  if (match == null) throw new RangeError(`Not a time: ${String(time)}`);
  return zoneInstant(date, Number(match[1]) * 60 + Number(match[2]), timeZone);
}

/** The date and `HH:MM` of an instant in the zone. */
export function salesLocal(
  instant: Date,
  timeZone: string,
): { date: CalendarDate; time: string } {
  const p = zoneParts(instant, timeZone);
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
