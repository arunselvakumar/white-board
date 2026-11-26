import { addDays, type CalendarDate } from "./calendar-date";
import { DomainError } from "./domain-error";

/**
 * A person's attendance as the Attendance tab shows it (ADR CM-0051): the
 * same shape for a Labour, a Site Engineer, a Vendor and an Office Staff
 * member, read by each context's own source. Pure: no I/O, no money.
 */

/** Best first: a day at two places takes the better of the two. */
export const ATTENDANCE_DAY_STATUSES = [
  "present",
  "half_day",
  "paid_leave",
  "on_leave",
  "holiday",
  "week_off",
  "absent",
] as const;
export type AttendanceDayStatus = (typeof ATTENDANCE_DAY_STATUSES)[number];

/** What a day's shade measures: hours, or a Vendor's head-days. */
export type AttendanceMeasure = "hours" | "head_days";

/**
 * Where a person's hours at a place came from: In and Out (or the Check-In
 * log), the working hours marked on a day with no times (ADR CM-0051 §3),
 * or nothing (absent, leave, a Vendor's headcount).
 */
export type AttendanceHoursFrom = "times" | "working_hours" | "none";

/** A place as a source gives it: a Project by id, or an HRMS office branch. */
export type AttendancePlaceRef =
  | { kind: "project"; projectId: string }
  | { kind: "branch"; branchId: string; name: string };

/** One place on one day, as a source reads it. */
export type AttendancePlaceRow = {
  place: AttendancePlaceRef;
  /** The status marked at this place, when the source marks one (Labours). */
  status: AttendanceDayStatus | null;
  /** `HH:MM`, Company time. */
  checkIn: string | null;
  /** `HH:MM`; at or before `checkIn` is the next day. */
  checkOut: string | null;
  workedMinutes: number;
  overtimeMinutes: number;
  hoursFrom: AttendanceHoursFrom;
  /** Checked in with no Check Out (adds no hours). */
  open: boolean;
  /** HRMS entries awaiting approval (add no hours). */
  pending: boolean;
  /** A Vendor's headcount at this place. */
  heads: { full: number; half: number } | null;
};

/** One day, as a source reads it. */
export type AttendanceDayRow = {
  date: CalendarDate;
  /** The day's own status when the source works one out (HRMS); else from the places. */
  status: AttendanceDayStatus | null;
  places: AttendancePlaceRow[];
};

/** `YYYY-MM`. */
export type CalendarMonth = string;

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isCalendarMonth(value: string): boolean {
  return MONTH_RE.test(value);
}

export function monthOf(date: CalendarDate): CalendarMonth {
  return date.slice(0, 7);
}

export function addMonths(month: CalendarMonth, count: number): CalendarMonth {
  const match = MONTH_RE.exec(month);
  if (match == null)
    throw new DomainError(
      "MONTH_INVALID",
      `"${month}" is not a month (YYYY-MM).`,
    );
  const index = Number(match[1]) * 12 + Number(match[2]) - 1 + count;
  const year = Math.floor(index / 12);
  return `${String(year).padStart(4, "0")}-${String((index % 12) + 1).padStart(2, "0")}`;
}

export function firstDayOf(month: CalendarMonth): CalendarDate {
  return `${month}-01`;
}

export function lastDayOf(month: CalendarMonth): CalendarDate {
  return addDays(firstDayOf(addMonths(month, 1)), -1);
}

/** Months from `from` to `to`, inclusive, oldest first. */
export function monthsBetween(
  from: CalendarMonth,
  to: CalendarMonth,
): CalendarMonth[] {
  const months: CalendarMonth[] = [];
  for (let month = from; month <= to; month = addMonths(month, 1))
    months.push(month);
  return months;
}

/** Head-days for a headcount: full days plus half days as halves. */
export function headDays(heads: { full: number; half: number }): number {
  return heads.full + heads.half / 2;
}

const RANK = new Map(ATTENDANCE_DAY_STATUSES.map((status, i) => [status, i]));

/**
 * The day's status: the source's own (HRMS), or the best status marked at
 * its places, or Present when a place was worked with no status (a
 * Check-In log, a Vendor's headcount).
 */
export function dayStatus(row: AttendanceDayRow): AttendanceDayStatus {
  if (row.status != null) return row.status;
  let best: AttendanceDayStatus | null = null;
  for (const place of row.places) {
    const status = place.status ?? "present";
    if (best == null || (RANK.get(status) ?? 99) < (RANK.get(best) ?? 99))
      best = status;
  }
  return best ?? "present";
}

/** The day counts as worked: a full day, or a half. */
export function workedShare(status: AttendanceDayStatus): 0 | 0.5 | 1 {
  if (status === "present") return 1;
  if (status === "half_day") return 0.5;
  return 0;
}

/** The window a source reads. */
export type PersonAttendanceWindow = {
  workspaceId: string;
  personId: string;
  /** Inclusive. */
  from: CalendarDate;
  to: CalendarDate;
  /** Projects whose days may be read; null for every one (the Owner). */
  visibleProjectIds: readonly string[] | null;
  timeZone: string;
};

/**
 * One kind of person's attendance (ADR CM-0051 §3), read by the context
 * that owns it. Days a source returns may hold no places once hidden
 * Projects are left out; the service drops those.
 */
export type PersonAttendanceSource = {
  /** The person's first day on the books (joining or added), or null when not found. */
  person(
    workspaceId: string,
    personId: string,
    timeZone: string,
  ): Promise<{ since: CalendarDate } | null>;
  /** The earliest day with attendance at a visible place, or null. */
  firstDay(
    window: Omit<PersonAttendanceWindow, "from" | "to">,
  ): Promise<CalendarDate | null>;
  /** Days with attendance from `from` to `to`, any order. */
  days(window: PersonAttendanceWindow): Promise<AttendanceDayRow[]>;
};

/** All-time figures (ADR CM-0051 §4). */
export type AttendanceAllTime = {
  firstDay: CalendarDate | null;
  lastDay: CalendarDate | null;
  /** A Half Day counts as half; a Vendor's days supplied. */
  daysWorked: number;
  workedMinutes: number;
  overtimeMinutes: number;
  /** A Vendor's head-days; 0 for everyone else. */
  headDays: number;
  /** Distinct places worked at. */
  places: number;
};

function placeKey(place: AttendancePlaceRef): string {
  return place.kind === "project"
    ? `project:${place.projectId}`
    : `branch:${place.branchId}`;
}

/**
 * Adds up the days a source read, for the all-time line: a Half Day is
 * half a day worked, and hours are added up on every day that has them,
 * a holiday worked included (the share is only for the day count).
 */
export function allTimeOf(
  rows: readonly AttendanceDayRow[],
): AttendanceAllTime {
  const places = new Set<string>();
  let firstDay: CalendarDate | null = null;
  let lastDay: CalendarDate | null = null;
  let daysWorked = 0;
  let workedMinutes = 0;
  let overtimeMinutes = 0;
  let heads = 0;
  for (const row of rows) {
    const share = workedShare(dayStatus(row));
    // Hours count wherever they were recorded: a holiday or week off
    // worked, or an HRMS day short of half a day, as the month's cards do.
    const recorded = row.places.some(
      (place) => place.workedMinutes > 0 || place.overtimeMinutes > 0,
    );
    if (share === 0 && !recorded) continue;
    daysWorked += share;
    if (firstDay == null || row.date < firstDay) firstDay = row.date;
    if (lastDay == null || row.date > lastDay) lastDay = row.date;
    for (const place of row.places) {
      if (
        place.workedMinutes > 0 ||
        place.heads != null ||
        place.open ||
        place.pending ||
        workedShare(place.status ?? "present") > 0
      )
        places.add(placeKey(place.place));
      workedMinutes += place.workedMinutes;
      overtimeMinutes += place.overtimeMinutes;
      if (place.heads != null) heads += headDays(place.heads);
    }
  }
  return {
    firstDay,
    lastDay,
    daysWorked,
    workedMinutes,
    overtimeMinutes,
    headDays: heads,
    places: places.size,
  };
}

/** Whole minutes in decimal hours (`"8"`, `"7.5"`, `"0.25"`), for overtime rows. */
export function minutesOfHours(hours: string | number): number {
  return Math.round(Number(hours) * 60);
}
