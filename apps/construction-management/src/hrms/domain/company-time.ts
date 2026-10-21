import {
  daysBetween,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { zoneInstant, zoneParts } from "@/src/shared-kernel/zone-time";

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

/** Where `instant` falls on the Company's wall clock. */
export function localDateTime(instant: Date, timeZone: string): LocalDateTime {
  const p = zoneParts(instant, timeZone);
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

/**
 * The instant a date and `HH:MM` name on the Company's wall clock. In a
 * zone with daylight saving a time skipped by the change resolves to the
 * first instant after the skipped stretch (`zoneInstant`; India has none).
 */
export function instantAt(
  date: CalendarDate,
  time: string,
  timeZone: string,
): Date {
  return zoneInstant(date, minutesOf(time), timeZone);
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
