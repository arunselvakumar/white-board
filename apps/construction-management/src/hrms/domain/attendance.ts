import {
  addDays,
  daysBetween,
  isCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import {
  conflict,
  DomainError,
  forbidden,
} from "@/src/shared-kernel/domain-error";

import {
  distanceToFence,
  matchFence,
  roundCoordinate,
  type Fence,
} from "./branch";
import { instantAt, minutesIntoDay, type LocalDateTime } from "./company-time";
import { isLatitude, isLongitude } from "./geo";
import type { GpsRequirement } from "./hrms-settings";
import { crossesMidnight, isShiftTime, minutesOf } from "./shift";

/**
 * Attendance entries (CM-308, `modules/10` "AttendanceEntry", ADR CM-0012
 * §1–3, §5, §17). One entry is one check-in/check-out pair; a day can
 * have several. The rules:
 *
 * - **Check In** (`decideCheckIn`) follows the GPS requirement: `disabled`
 *   takes no location; `record_only` accepts a check-in outside every
 *   fence (or without a location, or with no fence configured) but sends
 *   it to Attendance Approvals marked out of fence; `required` refuses
 *   one with no location (`LOCATION_REQUIRED`), no fence
 *   (`OFFICE_LOCATION_NOT_CONFIGURED`) or outside every fence
 *   (`OUTSIDE_FENCE`). An on-fence check-in needs no approval.
 * - **At most one open entry** per member (`ATTENDANCE_ALREADY_OPEN`).
 * - A check-in belongs to the Company date it happens on, except inside
 *   the night of the day before's midnight-crossing shift, which it
 *   belongs to (`attendanceDateOf`).
 * - **Check Out** closes the open entry on its own date, or the next date
 *   for a midnight-crossing shift (within 24 hours). An entry left open
 *   on an earlier day needs a **missed checkout** instead
 *   (`ATTENDANCE_OPEN_FROM_EARLIER_DAY`).
 * - A **missed checkout** is only for an entry open from an earlier day;
 *   the checkout is after the check-in, within 24 hours of it and not in
 *   the future; a reason is required; it goes to approvals.
 * - A **back-dated day** (manual entry) is for a past date (the
 *   Back-dated Entry check is the handler's); check-out at or before
 *   check-in falls on the next day; a reason is required; it may not
 *   overlap another entry; it goes to approvals.
 * - **Approve / reject** only a pending entry (`ATTENDANCE_NOT_PENDING`),
 *   never one's own unless the Owner (`ATTENDANCE_SELF_APPROVAL`); a
 *   rejection needs a reason.
 * - Hours of an entry are its check-out minus its check-in. Only closed
 *   entries that need no approval or are approved count (`attendanceDay`).
 */

export const ATTENDANCE_SOURCES = [
  "check_in",
  "manual",
  "missed_checkout",
] as const;

export type AttendanceSource = (typeof ATTENDANCE_SOURCES)[number];

export const APPROVAL_STATUSES = [
  "none",
  "pending",
  "approved",
  "rejected",
] as const;

export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const ATTENDANCE_LIMITS = {
  minReasonLength: 3,
  maxReasonLength: 500,
  /** The longest an entry may last, hours. */
  maxEntryHours: 24,
} as const;

const HOUR_MS = 3_600_000;

/** A device location with the accuracy it reported (metres; null = unknown). */
export type GpsFix = Readonly<{
  latitude: number;
  longitude: number;
  accuracyMetres: number | null;
}>;

function invalid(code: string, message: string, field: string): DomainError {
  return new DomainError(code, message, { details: { field } });
}

/**
 * The location a check-in or check-out sends: both coordinates or none,
 * in range, accuracy 0 or more. Coordinates keep 6 decimals, accuracy 2.
 */
export function readGpsFix(input: {
  latitude?: number | null;
  longitude?: number | null;
  accuracyMetres?: number | null;
}): GpsFix | null {
  const { latitude, longitude, accuracyMetres } = input;
  if (latitude == null && longitude == null) return null;
  if (latitude == null || !isLatitude(latitude))
    throw invalid(
      "LOCATION_INVALID",
      "The location's latitude is a number from -90 to 90.",
      "latitude",
    );
  if (longitude == null || !isLongitude(longitude))
    throw invalid(
      "LOCATION_INVALID",
      "The location's longitude is a number from -180 to 180.",
      "longitude",
    );
  if (
    accuracyMetres != null &&
    (!Number.isFinite(accuracyMetres) || accuracyMetres < 0)
  )
    throw invalid(
      "LOCATION_INVALID",
      "The location's accuracy is 0 metres or more.",
      "accuracyMetres",
    );
  return Object.freeze({
    latitude: roundCoordinate(latitude),
    longitude: roundCoordinate(longitude),
    accuracyMetres:
      accuracyMetres == null
        ? null
        : Math.min(Math.round(accuracyMetres * 100) / 100, 999_999.99),
  });
}

export type CheckInDecision = {
  /** The fence the location matched, if any (nearest centre). */
  branchId: string | null;
  /** Accepted outside every fence under `record_only`. */
  outOfFence: boolean;
  approvalStatus: "none" | "pending";
};

/** 409: GPS is required but no fence applies to the member. */
export function officeLocationNotConfigured(): DomainError {
  return conflict(
    "OFFICE_LOCATION_NOT_CONFIGURED",
    "Office location is not configured. Ask the Owner to add your office branch or Project site in HRMS → Branches & Sites.",
  );
}

/**
 * What a check-in with this location does under the Company's GPS
 * requirement and the member's fences (ADR CM-0012 §1, §3).
 */
export function decideCheckIn(
  gps: GpsRequirement,
  fences: readonly Fence[],
  fix: GpsFix | null,
): CheckInDecision {
  const match =
    fix == null ? null : matchFence(fences, fix, fix.accuracyMetres);
  if (gps === "disabled")
    return {
      branchId: match?.fence.id ?? null,
      outOfFence: false,
      approvalStatus: "none",
    };
  if (gps === "record_only")
    return match == null
      ? { branchId: null, outOfFence: true, approvalStatus: "pending" }
      : { branchId: match.fence.id, outOfFence: false, approvalStatus: "none" };
  if (fix == null)
    throw invalid(
      "LOCATION_REQUIRED",
      "Allow location access to check in: your Company checks that you are at the office or site.",
      "location",
    );
  if (fences.length === 0) throw officeLocationNotConfigured();
  if (match == null) {
    let nearest: { name: string; metres: number } | null = null;
    for (const fence of fences) {
      const metres = distanceToFence(fence, fix) - fence.radiusMetres;
      if (nearest == null || metres < nearest.metres)
        nearest = { name: fence.name, metres };
    }
    const metres = Math.max(0, Math.round(nearest?.metres ?? 0));
    throw new DomainError(
      "OUTSIDE_FENCE",
      `Outside Fence: you are about ${metres.toLocaleString("en-IN")} m outside ${nearest?.name ?? "your office"}. Move inside the fence to check in.`,
      {
        details: {
          field: "location",
          nearestFence: nearest?.name ?? null,
          metresOutside: metres,
        },
      },
    );
  }
  return {
    branchId: match.fence.id,
    outOfFence: false,
    approvalStatus: "none",
  };
}

/** 409: an open entry blocks a second check-in (the active check-in guard). */
export function attendanceAlreadyOpen(open: {
  id: string;
  date: CalendarDate;
}): DomainError {
  return conflict(
    "ATTENDANCE_ALREADY_OPEN",
    `You are already checked in (since ${open.date}). Check out first.`,
    { entryId: open.id, date: open.date },
  );
}

/** A shift's times, as the attendance rules read them; null for the Settings day. */
export type ShiftTimes = { startTime: string; endTime: string } | null;

/**
 * The attendance date of a check-in at `local`: its own Company date,
 * unless it falls before the end of the previous date's shift and that
 * shift crosses midnight (a night shift belongs to the day it starts).
 */
export function attendanceDateOf(
  local: LocalDateTime,
  previousDayShift: ShiftTimes,
): CalendarDate {
  if (
    previousDayShift != null &&
    crossesMidnight(previousDayShift.startTime, previousDayShift.endTime) &&
    local.minutes < minutesOf(previousDayShift.endTime)
  )
    return addDays(local.date, -1);
  return local.date;
}

/** Hours between two instants, to two decimals. */
export function hoursBetween(from: Date, to: Date): number {
  return Math.round(((to.getTime() - from.getTime()) / HOUR_MS) * 100) / 100;
}

/** An entry as the rules read it. */
export type EntryFacts = {
  id: string;
  memberId: string;
  date: CalendarDate;
  checkInAt: Date;
  checkOutAt: Date | null;
  approvalStatus: ApprovalStatus;
};

/** 409: the entry has a checkout (or was rejected), so it is not open. */
function notOpen(): DomainError {
  return conflict(
    "ATTENDANCE_NOT_OPEN",
    "This attendance is already closed. Reload to see it.",
  );
}

/**
 * Whether Check Out may close `entry` at `at` (Company wall clock
 * `local`): on the entry's own date, or the next date when that day's
 * shift crosses midnight and within 24 hours. Otherwise the entry was
 * left open on an earlier day and needs a missed checkout.
 */
export function assertCanCheckOut(
  entry: EntryFacts,
  at: Date,
  local: LocalDateTime,
  entryShift: ShiftTimes,
): void {
  if (entry.checkOutAt != null || entry.approvalStatus === "rejected")
    throw notOpen();
  if (at.getTime() <= entry.checkInAt.getTime())
    throw invalid(
      "CHECK_OUT_BEFORE_CHECK_IN",
      "Check-out must be after check-in.",
      "checkOutAt",
    );
  const days = daysBetween(entry.date, local.date);
  const nightShift =
    entryShift != null &&
    crossesMidnight(entryShift.startTime, entryShift.endTime);
  const withinDay =
    at.getTime() - entry.checkInAt.getTime() <=
    ATTENDANCE_LIMITS.maxEntryHours * HOUR_MS;
  if (days === 0 || (days === 1 && nightShift && withinDay)) return;
  throw conflict(
    "ATTENDANCE_OPEN_FROM_EARLIER_DAY",
    `Your check-in on ${entry.date} was never checked out. Add a missed checkout for it.`,
    { entryId: entry.id, date: entry.date },
  );
}

/** A reason a member or approver types: required, 3–500 characters. */
export function readReason(raw: string | null | undefined, field = "reason") {
  const reason = (raw ?? "").trim();
  if (reason.length < ATTENDANCE_LIMITS.minReasonLength)
    throw invalid(
      field === "reason" ? "REASON_REQUIRED" : "REJECTION_REASON_REQUIRED",
      "Give a reason (at least 3 characters).",
      field,
    );
  if (reason.length > ATTENDANCE_LIMITS.maxReasonLength)
    throw invalid(
      "REASON_TOO_LONG",
      `Use at most ${String(ATTENDANCE_LIMITS.maxReasonLength)} characters.`,
      field,
    );
  return reason;
}

/**
 * Checks a missed checkout for `entry` at `at` (ADR CM-0012 §3): the
 * entry is open from a date before `today`; the checkout is after the
 * check-in, at most 24 hours after it and not later than `now`.
 */
export function assertMissedCheckout(
  entry: EntryFacts,
  at: Date,
  now: Date,
  today: CalendarDate,
): void {
  if (entry.checkOutAt != null || entry.approvalStatus === "rejected")
    throw notOpen();
  if (daysBetween(entry.date, today) <= 0)
    throw conflict(
      "MISSED_CHECKOUT_NOT_NEEDED",
      "Today's check-in is still open. Check out instead.",
    );
  if (at.getTime() <= entry.checkInAt.getTime())
    throw invalid(
      "CHECK_OUT_BEFORE_CHECK_IN",
      "The checkout must be after the check-in.",
      "checkOutTime",
    );
  if (
    at.getTime() - entry.checkInAt.getTime() >
    ATTENDANCE_LIMITS.maxEntryHours * HOUR_MS
  )
    throw invalid(
      "CHECK_OUT_TOO_LATE",
      "The checkout must be within 24 hours of the check-in.",
      "checkOutTime",
    );
  if (at.getTime() > now.getTime())
    throw invalid(
      "CHECK_OUT_IN_FUTURE",
      "The checkout cannot be in the future.",
      "checkOutTime",
    );
}

/**
 * The instants of a back-dated day (manual entry): `date` before
 * `today`, times `HH:MM` on the Company's wall clock; a check-out at or
 * before the check-in is on the next day (a night shift); equal times are
 * refused. The Back-dated Entry policy is the handler's check.
 */
export function manualEntryTimes(
  input: { date: string; checkInTime: string; checkOutTime: string },
  today: CalendarDate,
  timeZone: string,
): { date: CalendarDate; checkInAt: Date; checkOutAt: Date } {
  if (!isCalendarDate(input.date))
    throw invalid("ENTRY_DATE_INVALID", "Choose the date.", "date");
  if (daysBetween(input.date, today) <= 0)
    throw invalid(
      "MANUAL_DATE_NOT_PAST",
      "A back-dated day is for an earlier date. For today, check in and out.",
      "date",
    );
  if (!isShiftTime(input.checkInTime))
    throw invalid(
      "CHECK_IN_TIME_INVALID",
      "Enter the check-in time as HH:MM, 24-hour.",
      "checkInTime",
    );
  if (!isShiftTime(input.checkOutTime))
    throw invalid(
      "CHECK_OUT_TIME_INVALID",
      "Enter the check-out time as HH:MM, 24-hour.",
      "checkOutTime",
    );
  if (input.checkInTime === input.checkOutTime)
    throw invalid(
      "CHECK_OUT_TIME_INVALID",
      "Check-out must differ from check-in.",
      "checkOutTime",
    );
  const nextDay = minutesOf(input.checkOutTime) < minutesOf(input.checkInTime);
  return {
    date: input.date,
    checkInAt: instantAt(input.date, input.checkInTime, timeZone),
    checkOutAt: instantAt(
      nextDay ? addDays(input.date, 1) : input.date,
      input.checkOutTime,
      timeZone,
    ),
  };
}

/** Another entry of the member, as the overlap check reads it. */
export type EntrySpan = {
  id: string;
  date: CalendarDate;
  checkInAt: Date;
  /** Null while open: it runs on. */
  checkOutAt: Date | null;
  approvalStatus: ApprovalStatus;
};

/**
 * 409 `ATTENDANCE_OVERLAP` when `[from, to)` overlaps one of `others`
 * (rejected entries do not count; an open one runs on). Touching is fine.
 */
export function assertNoOverlap(
  span: { from: Date; to: Date; exceptId?: string | null },
  others: readonly EntrySpan[],
  field = "checkInTime",
): void {
  for (const other of others) {
    if (other.id === span.exceptId || other.approvalStatus === "rejected")
      continue;
    const otherEnd = other.checkOutAt?.getTime() ?? Number.POSITIVE_INFINITY;
    if (
      span.from.getTime() < otherEnd &&
      other.checkInAt.getTime() < span.to.getTime()
    )
      throw new DomainError(
        "ATTENDANCE_OVERLAP",
        other.checkOutAt == null
          ? `This overlaps your check-in on ${other.date}, which is still open. Close it first.`
          : `This overlaps your attendance on ${other.date}.`,
        {
          kind: "conflict",
          details: { field, entryId: other.id, date: other.date },
        },
      );
  }
}

/**
 * Who may approve or reject `entry` (ADR CM-0012 §5): only a pending
 * entry; never one's own, except the Owner.
 */
export function assertCanDecide(
  entry: EntryFacts,
  decider: { memberId: string | null; isOwner: boolean },
): void {
  if (entry.approvalStatus !== "pending")
    throw conflict(
      "ATTENDANCE_NOT_PENDING",
      entry.approvalStatus === "approved"
        ? "This attendance is already approved."
        : entry.approvalStatus === "rejected"
          ? "This attendance is already rejected."
          : "This attendance needs no approval.",
      { approvalStatus: entry.approvalStatus },
    );
  if (!decider.isOwner && decider.memberId === entry.memberId)
    throw forbidden(
      "ATTENDANCE_SELF_APPROVAL",
      "You cannot approve or reject your own attendance. Another approver must decide it.",
    );
}

// ---------------------------------------------------------------------------
// Day status (ADR CM-0012 §2)
// ---------------------------------------------------------------------------

/** ADR CM-0012 §2. */
export type DayStatus =
  "present" | "half_day" | "absent" | "on_leave" | "holiday" | "week_off";

/** The day's shift, as day status reads it (`EffectiveShift`). */
export type DayShift = {
  startTime: string | null;
  endTime: string | null;
  workingHours: number;
  halfDayHours: number;
  /** The shift's grace, or the Settings grace for the Settings day. */
  graceMinutes: number;
  overtimeAllowed: boolean;
};

/** Approved leave on the day (CM-312), as day status reads it. */
export type DayLeave = { paid: boolean; days: 1 | 0.5 };

export type DayLeaveResult = {
  /** Every leave of the day is paid. */
  paid: boolean;
  /** Half a day (a morning or an afternoon). */
  half: boolean;
  /**
   * For a half day of leave: whether the other half was worked (hours ≥
   * the half-day hours) or is absent; null for a full day.
   */
  otherHalf: "present" | "absent" | null;
};

export type DayResult = {
  date: CalendarDate;
  status: DayStatus;
  /** Hours of closed entries that need no approval or are approved. */
  workedHours: number;
  /**
   * Hours beyond the shift's working hours on a working day, every hour
   * worked on a holiday or week off. Reported whether or not paid.
   */
  overtimeHours: number;
  /** The day's shift allows overtime pay (ADR CM-0012 §14). */
  overtimeAllowed: boolean;
  /** The day's shift working hours (the overtime hourly rate divides by it). */
  shiftWorkingHours: number;
  /** First check-in after the shift start plus grace, on a working day. */
  late: boolean;
  leave: DayLeaveResult | null;
};

/** An entry as day status reads it. */
export type DayEntry = {
  checkInAt: Date;
  checkOutAt: Date | null;
  approvalStatus: ApprovalStatus;
};

/** Closed and either approval-free or approved: its hours count. */
export function countsTowardHours(entry: DayEntry): boolean {
  return (
    entry.checkOutAt != null &&
    (entry.approvalStatus === "none" || entry.approvalStatus === "approved")
  );
}

/**
 * One member's day (CM-308): a non-optional holiday or a week off keeps
 * that status whatever was worked (the hours are reported as overtime);
 * approved leave makes it On Leave (a half day of leave also says
 * whether the other half was worked); otherwise the hours of counting
 * entries against the shift's working hours make it Present, Half Day or
 * Absent. Late is the first check-in (any entry not rejected) after the
 * shift's start plus its grace; it never changes the status, and the
 * Settings day (no start time) is never late. A midnight-crossing shift's
 * entries are dated on the day it starts, so they are all here.
 */
export function attendanceDay(input: {
  date: CalendarDate;
  kind: "working" | "week_off" | "holiday";
  shift: DayShift;
  entries: readonly DayEntry[];
  leave: readonly DayLeave[];
  timeZone: string;
}): DayResult {
  const { date, kind, shift } = input;
  const workedMs = input.entries
    .filter(countsTowardHours)
    .reduce(
      (sum, entry) =>
        sum + ((entry.checkOutAt?.getTime() ?? 0) - entry.checkInAt.getTime()),
      0,
    );
  const workedHours = Math.round((workedMs / HOUR_MS) * 100) / 100;
  const base = {
    date,
    workedHours,
    overtimeAllowed: shift.overtimeAllowed,
    shiftWorkingHours: shift.workingHours,
  };
  if (kind !== "working")
    return {
      ...base,
      status: kind,
      overtimeHours: workedHours,
      late: false,
      leave: null,
    };

  const overtimeHours =
    Math.round(Math.max(0, workedHours - shift.workingHours) * 100) / 100;
  let late = false;
  const live = input.entries.filter(
    (entry) => entry.approvalStatus !== "rejected",
  );
  if (shift.startTime != null && live.length > 0) {
    const first = Math.min(
      ...live.map((entry) =>
        minutesIntoDay(date, entry.checkInAt, input.timeZone),
      ),
    );
    late = first > minutesOf(shift.startTime) + shift.graceMinutes;
  }

  const leaveDays = input.leave.reduce((sum, leave) => sum + leave.days, 0);
  if (leaveDays > 0) {
    const paid = input.leave.every((leave) => leave.paid);
    const half = leaveDays < 1;
    return {
      ...base,
      status: "on_leave",
      overtimeHours,
      late: half && late,
      leave: {
        paid,
        half,
        otherHalf: half
          ? workedHours >= shift.halfDayHours
            ? "present"
            : "absent"
          : null,
      },
    };
  }

  const status: DayStatus =
    workedHours >= shift.workingHours
      ? "present"
      : workedHours >= shift.halfDayHours
        ? "half_day"
        : "absent";
  return { ...base, status, overtimeHours, late, leave: null };
}

/** A month's days counted the way the salary slip and the summary show them. */
export type DayCounts = {
  /** Days that are not holidays or week offs. */
  workingDays: number;
  /** Present days; the worked half of a half-day leave counts 0.5. */
  present: number;
  /** Days with status Half Day. */
  halfDays: number;
  /** Absent days; the unworked half of a half-day leave counts 0.5. */
  absent: number;
  paidLeave: number;
  unpaidLeave: number;
  weekOff: number;
  holidays: number;
  late: number;
  workedHours: number;
  overtimeHours: number;
};

/** Counts days in half-day steps (salary decision 12: they never exceed the month). */
export function countDays(days: readonly DayResult[]): DayCounts {
  const counts: DayCounts = {
    workingDays: 0,
    present: 0,
    halfDays: 0,
    absent: 0,
    paidLeave: 0,
    unpaidLeave: 0,
    weekOff: 0,
    holidays: 0,
    late: 0,
    workedHours: 0,
    overtimeHours: 0,
  };
  let workedHundredths = 0;
  let overtimeHundredths = 0;
  for (const day of days) {
    workedHundredths += Math.round(day.workedHours * 100);
    overtimeHundredths += Math.round(day.overtimeHours * 100);
    if (day.late) counts.late += 1;
    switch (day.status) {
      case "holiday":
        counts.holidays += 1;
        continue;
      case "week_off":
        counts.weekOff += 1;
        continue;
      case "present":
        counts.present += 1;
        break;
      case "half_day":
        counts.halfDays += 1;
        break;
      case "absent":
        counts.absent += 1;
        break;
      case "on_leave": {
        const leave = day.leave;
        const share = leave?.half === true ? 0.5 : 1;
        if (leave?.paid === false) counts.unpaidLeave += share;
        else counts.paidLeave += share;
        if (leave?.otherHalf === "present") counts.present += 0.5;
        if (leave?.otherHalf === "absent") counts.absent += 0.5;
        break;
      }
    }
    counts.workingDays += 1;
  }
  counts.workedHours = workedHundredths / 100;
  counts.overtimeHours = overtimeHundredths / 100;
  return counts;
}

// ---------------------------------------------------------------------------
// Today, live (Team Today, the Projects home banner)
// ---------------------------------------------------------------------------

export const LIVE_STATES = [
  "checked_in",
  "checked_out",
  "not_checked_in",
  "on_leave",
  "holiday",
  "week_off",
] as const;

/** Where a member stands right now (Team Today). */
export type LiveState = (typeof LIVE_STATES)[number];

/**
 * Right now: Checked In while the member has an open entry that Check Out
 * can still close (`openNow`: today's, or last night's midnight-crossing
 * shift); Checked Out once today has entries (not rejected) and none is
 * open; else the day off (holiday, week off, a full day of leave) or Not
 * Checked In. An entry left open on an earlier day is not a check-in.
 */
export function liveState(input: {
  kind: "working" | "week_off" | "holiday";
  fullDayLeave: boolean;
  /** Today's entries. */
  entries: readonly DayEntry[];
  openNow: boolean;
}): LiveState {
  if (input.openNow) return "checked_in";
  if (input.entries.some((entry) => entry.approvalStatus !== "rejected"))
    return "checked_out";
  if (input.kind === "holiday") return "holiday";
  if (input.kind === "week_off") return "week_off";
  if (input.fullDayLeave) return "on_leave";
  return "not_checked_in";
}

/** Whether Check Out can close `entry` now (`assertCanCheckOut` passes). */
export function canCheckOutNow(
  entry: EntryFacts,
  at: Date,
  local: LocalDateTime,
  entryShift: ShiftTimes,
): boolean {
  try {
    assertCanCheckOut(entry, at, local, entryShift);
    return true;
  } catch {
    return false;
  }
}
