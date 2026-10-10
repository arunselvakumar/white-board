import {
  assertCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { fiscalYearOf } from "@/src/shared-kernel/sequence";

/**
 * The leave year a date counts against (ADR CM-0012 §6): `calendar`
 * (January–December, keyed "2026") or `financial` (April–March, keyed
 * "26-27", like Sequence IDs). Leave ledger entries and requests store the
 * key, so changing the setting never moves old entries.
 */
export type LeaveYearSetting = "calendar" | "financial";

export const LEAVE_YEAR_SETTINGS: readonly LeaveYearSetting[] = [
  "calendar",
  "financial",
];

export type LeaveYear = {
  /** "2026" or "26-27". */
  key: string;
  /** First day, inclusive. */
  start: CalendarDate;
  /** Last day, inclusive. */
  end: CalendarDate;
};

export function leaveYearOf(
  date: CalendarDate,
  setting: LeaveYearSetting,
): LeaveYear {
  const year = Number(assertCalendarDate(date).slice(0, 4));
  if (setting === "calendar")
    return { key: String(year), start: `${year}-01-01`, end: `${year}-12-31` };
  const fiscal = fiscalYearOf(date);
  return {
    key: fiscal.label,
    start: `${fiscal.startYear}-04-01`,
    end: `${fiscal.startYear + 1}-03-31`,
  };
}

/** The key alone: "2026" or "26-27". */
export function leaveYearKey(
  date: CalendarDate,
  setting: LeaveYearSetting,
): string {
  return leaveYearOf(date, setting).key;
}

/** Whether a stored key has either shape. */
export function isLeaveYearKey(value: string): boolean {
  return /^(\d{4}|\d{2}-\d{2})$/.test(value);
}
