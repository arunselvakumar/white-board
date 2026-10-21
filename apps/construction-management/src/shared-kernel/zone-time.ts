import { assertCalendarDate, type CalendarDate } from "./calendar-date";

/**
 * A Company's wall clock in its IANA time zone (HRMS CM-308, sales
 * CM-1003). One place turns instants into a zone's date and time and
 * back, so every context resolves a daylight-saving change the same way.
 */

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

/** The wall-clock fields of an instant in the zone. */
export type ZoneParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export function zoneParts(instant: Date, timeZone: string): ZoneParts {
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

/** The zone's offset from UTC at `instant` (epoch ms), milliseconds. */
function offsetAt(instant: number, timeZone: string): number {
  const p = zoneParts(new Date(instant), timeZone);
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
 * The instant a date and a time (`minutes` after midnight) name on the
 * zone's wall clock. A time the clocks repeat (daylight saving ends) is
 * the earlier one. A time the clocks skip (daylight saving starts) is the
 * first instant after the skipped stretch: 02:30 on New York's spring
 * change is 03:00, and midnight in a zone whose change is at midnight
 * (America/Santiago) is 01:00 that day, never 23:00 the day before.
 */
export function zoneInstant(
  date: CalendarDate,
  minutes: number,
  timeZone: string,
): Date {
  assertCalendarDate(date);
  const [year, month, day] = date.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  // The wall time read as if it were UTC.
  const wall = Date.UTC(year, month - 1, day, 0, minutes);
  const first = wall - offsetAt(wall, timeZone);
  const second = wall - offsetAt(first, timeZone);
  if (second + offsetAt(second, timeZone) === wall) return new Date(second);
  // Skipped: the change lies between the two guesses. Find its instant,
  // the first one on the later offset, to the second.
  let before = Math.min(first, second);
  let after = Math.max(first, second);
  const later = offsetAt(after, timeZone);
  while (after - before > 1000) {
    const mid = before + Math.floor((after - before) / 2000) * 1000;
    if (offsetAt(mid, timeZone) === later) after = mid;
    else before = mid;
  }
  return new Date(after);
}
