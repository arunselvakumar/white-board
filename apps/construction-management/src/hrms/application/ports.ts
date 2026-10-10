import type { CalendarDate } from "@/src/shared-kernel/calendar-date";

import type { MonthKey } from "../domain/calendar";
import type { HrmsSettings } from "../domain/hrms-settings";
import type { EsiRate, PfRate, PtCharge, PtGender } from "../domain/statutory";

/**
 * What the hrms context reads from other contexts and from its own later
 * tickets, as interfaces (`modules/10`, M3 foundation). Records of other
 * contexts are read by id with plain reads in infrastructure, so no context
 * imports another (ADR CM-0001, as M2 did). Every method is scoped to one
 * Company (`workspaceId`).
 *
 * Built now: `EmployeeDirectory`, `ProjectDirectory`, `HrmsSettingsReader`,
 * `MonthLock` (reader) and `StatutoryRates`. The others have stand-ins in
 * `stub-ports.ts`, each marked with the ticket that replaces it; swap them
 * in `infrastructure/create-hrms-ports.ts`.
 */

// ---------------------------------------------------------------------------
// People and Projects (organization and projects contexts)
// ---------------------------------------------------------------------------

/**
 * A Team Member seen as an HRMS employee (`modules/01` Member Type). Both
 * Normal and HRMS Team Members check in, apply for leave and are paid.
 */
export type HrmsEmployee = {
  /** The Team Member id: what every hrms row calls `memberId`. */
  memberId: string;
  /** Null until the Join Request is accepted. */
  userId: string | null;
  name: string;
  memberType: "normal" | "hrms";
  designationId: string;
  designationName: string | null;
  /** Projects the member is assigned to; empty for HRMS Team Members. */
  projectIds: readonly string[];
  /** Joined (status active); a Joining Pending member is not yet active. */
  active: boolean;
  isOwner: boolean;
};

export type EmployeeDirectory = {
  /** Every live Team Member (not removed, not rejected), by name. */
  list(workspaceId: string): Promise<HrmsEmployee[]>;
  /** The live Team Members among `memberIds`. */
  find(
    workspaceId: string,
    memberIds: readonly string[],
  ): Promise<Map<string, HrmsEmployee>>;
  /** The signed-in User's Team Member in the Company ("My Attendance"). */
  findByUserId(
    workspaceId: string,
    userId: string,
  ): Promise<HrmsEmployee | null>;
};

export type HrmsProject = { id: string; name: string };

export type ProjectDirectory = {
  /** Every live Project of the Company, by name (site fence pickers). */
  list(workspaceId: string): Promise<HrmsProject[]>;
  /** The live Projects among `ids`. */
  find(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, HrmsProject>>;
};

// ---------------------------------------------------------------------------
// Settings (CM-303)
// ---------------------------------------------------------------------------

/** The Company's HRMS Settings, or the defaults when never saved. No access check. */
export type HrmsSettingsReader = {
  settingsFor(workspaceId: string): Promise<HrmsSettings>;
};

// ---------------------------------------------------------------------------
// Calendar and shifts (CM-305, CM-306, CM-307)
// ---------------------------------------------------------------------------

export type HrmsHoliday = {
  id: string;
  name: string;
  date: CalendarDate;
  type: "national" | "festival" | "company";
  /** A working day unless taken as leave (ADR CM-0012 §11). */
  isOptional: boolean;
};

/** What a date is for one member, before attendance and leave. */
export type WorkCalendarDay = {
  date: CalendarDate;
  /**
   * `holiday` for a non-optional holiday; `week_off` when the member's
   * shift (or the Settings working days) does not work that weekday, or a
   * rotation slot is a week off; `working` otherwise. A holiday on a week
   * off is a `holiday`.
   */
  kind: "working" | "week_off" | "holiday";
  /** The holiday on that date, optional ones included. */
  holiday: HrmsHoliday | null;
};

export type WorkCalendar = {
  /** The holiday on `date` (optional ones too), or null. */
  holidayFor(
    workspaceId: string,
    memberId: string,
    date: CalendarDate,
  ): Promise<HrmsHoliday | null>;
  /** A non-optional holiday. */
  isHoliday(
    workspaceId: string,
    memberId: string,
    date: CalendarDate,
  ): Promise<boolean>;
  /** Not a working weekday for the member's shift or rotation. */
  isWeekOff(
    workspaceId: string,
    memberId: string,
    date: CalendarDate,
  ): Promise<boolean>;
  /** Every date of the month for each member, for runs and reports. */
  monthFor(
    workspaceId: string,
    memberIds: readonly string[],
    month: MonthKey,
  ): Promise<Map<string, WorkCalendarDay[]>>;
};

/**
 * The shift a member works on a date (CM-307): their shift or rotation
 * slot in force, else the Settings (`source: "settings"`, no times, no
 * overtime pay; ADR CM-0012 Consequences).
 */
export type EffectiveShift = {
  source: "shift" | "rotation" | "settings";
  shiftTemplateId: string | null;
  rotationTemplateId: string | null;
  /** The shift's name, or "Standard" for the Settings. */
  name: string;
  /** `HH:MM`, Company time; null for the Settings. */
  startTime: string | null;
  endTime: string | null;
  workingHours: number;
  halfDayHours: number;
  graceMinutes: number;
  overtimeAllowed: boolean;
  /** False on a weekday the shift does not work or a rotation week-off slot. */
  isWorkingDay: boolean;
};

export type EffectiveShiftResolver = {
  shiftFor(
    workspaceId: string,
    memberId: string,
    date: CalendarDate,
  ): Promise<EffectiveShift>;
  /** Each date of the month for one member. */
  shiftsForMonth(
    workspaceId: string,
    memberId: string,
    month: MonthKey,
  ): Promise<Map<CalendarDate, EffectiveShift>>;
};

// ---------------------------------------------------------------------------
// Attendance and leave per day (CM-308, CM-312), read by salary (CM-316),
// the dashboard (CM-319) and monthly reports
// ---------------------------------------------------------------------------

/** ADR CM-0012 §2. */
export type HrmsDayStatus =
  "present" | "half_day" | "absent" | "on_leave" | "holiday" | "week_off";

export type AttendanceDay = {
  date: CalendarDate;
  status: HrmsDayStatus;
  /** Hours from approved and approval-free entries. */
  workedHours: number;
  /** Hours beyond the shift's working hours (shown even when unpaid). */
  overtimeHours: number;
  /** Checked in after the shift start plus grace; never changes the status. */
  late: boolean;
  /** On `on_leave`: the leave is paid, and whether it is half the day. */
  leave: { paid: boolean; half: boolean } | null;
};

export type AttendanceDaySource = {
  /** Every date of the month for each member, in order. */
  monthFor(
    workspaceId: string,
    memberIds: readonly string[],
    month: MonthKey,
  ): Promise<Map<string, AttendanceDay[]>>;
};

export type LeaveDay = {
  date: CalendarDate;
  requestId: string;
  leaveTypeId: string;
  leaveTypeName: string;
  isPaid: boolean;
  session: "full" | "morning" | "afternoon";
  /** 1 for a full day, 0.5 for a morning or an afternoon. */
  days: 1 | 0.5;
};

export type LeaveDaySource = {
  /** Approved (not cancelled) leave days in the month, per member. */
  approvedForMonth(
    workspaceId: string,
    memberIds: readonly string[],
    month: MonthKey,
  ): Promise<Map<string, LeaveDay[]>>;
};

// ---------------------------------------------------------------------------
// Month lock (ADR CM-0012 §17) and statutory figures (ADR CM-0008)
// ---------------------------------------------------------------------------

export type MonthLock = {
  /** Whether the member's month (or the Company's) is closed by an approved salary. */
  isLocked(
    workspaceId: string,
    memberId: string,
    date: CalendarDate,
  ): Promise<boolean>;
  /** Throws 409 `MONTH_LOCKED` when `isLocked`. */
  assertOpen(
    workspaceId: string,
    memberId: string,
    date: CalendarDate,
  ): Promise<void>;
};

/** Platform-wide figures in force for a salary month; null before the first row. */
export type StatutoryRates = {
  pfFor(month: MonthKey): Promise<PfRate | null>;
  esiFor(month: MonthKey): Promise<EsiRate | null>;
  /** The PT for a month's gross (paise) in a state; 0 where none applies. */
  ptFor(
    stateCode: string,
    month: MonthKey,
    gross: number,
    gender?: PtGender,
  ): Promise<PtCharge>;
};
