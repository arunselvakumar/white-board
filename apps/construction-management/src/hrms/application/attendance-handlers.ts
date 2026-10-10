import { assertCan, can, type MemberAccess } from "@/src/shared-kernel/access";
import {
  addDays,
  isCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import {
  conflict,
  DomainError,
  notFound,
} from "@/src/shared-kernel/domain-error";

import {
  assertCanCheckOut,
  assertCanDecide,
  assertMissedCheckout,
  attendanceAlreadyOpen,
  attendanceDateOf,
  canCheckOutNow,
  countDays,
  decideCheckIn,
  liveState,
  manualEntryTimes,
  readGpsFix,
  readReason,
  type ApprovalStatus,
  type AttendanceSource,
  type DayCounts,
  type GpsFix,
  type LiveState,
  type ShiftTimes,
} from "../domain/attendance";
import { matchFence, type Fence } from "../domain/branch";
import {
  assertMonthKey,
  firstDayOf,
  lastDayOf,
  type MonthKey,
} from "../domain/calendar";
import { instantAt, localDateTime } from "../domain/company-time";
import type { GpsRequirement } from "../domain/hrms-settings";
import { isShiftTime } from "../domain/shift";
import type {
  AttendanceDay,
  EffectiveShift,
  EffectiveShiftResolver,
  EmployeeDirectory,
  HrmsEmployee,
  HrmsSettingsReader,
  MonthLock,
  WorkCalendar,
} from "./ports";

/** An attendance entry as stored (`construction_hrms.attendance_entries`). */
export type StoredAttendanceEntry = {
  id: string;
  memberId: string;
  /** The attendance day (Company date of the check-in, or a night shift's start). */
  date: CalendarDate;
  checkInAt: Date;
  checkIn: GpsFix | null;
  checkInBranchId: string | null;
  checkOutAt: Date | null;
  checkOut: GpsFix | null;
  checkOutBranchId: string | null;
  source: AttendanceSource;
  approvalStatus: ApprovalStatus;
  outOfFence: boolean;
  reason: string | null;
  /** User id of the approver or rejecter. */
  decidedBy: string | null;
  decidedAt: Date | null;
  rejectionReason: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export type NewAttendanceEntry = Omit<
  StoredAttendanceEntry,
  | "id"
  | "createdAt"
  | "updatedAt"
  | "createdBy"
  | "decidedBy"
  | "decidedAt"
  | "rejectionReason"
>;

export type AttendanceChanges = Partial<
  Pick<
    StoredAttendanceEntry,
    | "checkOutAt"
    | "checkOut"
    | "checkOutBranchId"
    | "source"
    | "approvalStatus"
    | "reason"
    | "decidedBy"
    | "decidedAt"
    | "rejectionReason"
  >
>;

/** A span the store checks for overlap with the member's other entries. */
export type OverlapCheck = { from: Date; to: Date; exceptId?: string };

export type AttendanceStore = {
  find(workspaceId: string, id: string): Promise<StoredAttendanceEntry | null>;
  /** The member's open entry (no checkout, not rejected), if any. */
  openEntry(
    workspaceId: string,
    memberId: string,
  ): Promise<StoredAttendanceEntry | null>;
  /** Every open entry of the Company (Team Today). */
  openEntries(workspaceId: string): Promise<StoredAttendanceEntry[]>;
  entriesBetween(
    workspaceId: string,
    memberIds: readonly string[],
    from: CalendarDate,
    to: CalendarDate,
  ): Promise<StoredAttendanceEntry[]>;
  /** Pending entries, oldest date first; one member's when given. */
  pending(
    workspaceId: string,
    memberId?: string,
  ): Promise<StoredAttendanceEntry[]>;
  /**
   * Adds an entry, audited as `action`, under a lock on the member: 409
   * `ATTENDANCE_ALREADY_OPEN` for a second open entry; with `overlap`,
   * `assertNoOverlap` against the member's other entries.
   */
  create(input: {
    workspaceId: string;
    entry: NewAttendanceEntry;
    overlap: OverlapCheck | null;
    action: string;
    by: string;
    now: Date;
  }): Promise<StoredAttendanceEntry>;
  /**
   * Changes an entry whose `updatedAt` is still `expectedUpdatedAt`,
   * audited as `action` with the before and after: 404
   * `ATTENDANCE_NOT_FOUND`, 409 `ATTENDANCE_CHANGED` when stale; with
   * `overlap`, `assertNoOverlap` under the member's lock.
   */
  update(input: {
    workspaceId: string;
    id: string;
    expectedUpdatedAt: Date;
    changes: AttendanceChanges;
    overlap: OverlapCheck | null;
    action: string;
    by: string;
    now: Date;
  }): Promise<StoredAttendanceEntry>;
};

/**
 * The Back-dated Entry policy for module `hrms_attendance` (module 12),
 * for one Team Member: the returned check throws the kernel's
 * `BACKDATED_CREATE_BLOCKED` / `FINANCIAL_PERIOD_CLOSED`.
 */
export type AttendanceBackdatedGuard = {
  forActor(access: MemberAccess): Promise<(date: CalendarDate) => void>;
};

/** Reads one member's fences (`MemberFences`, CM-304). */
export type FenceReader = {
  fencesFor(workspaceId: string, memberId: string): Promise<Fence[]>;
};

/** Days of members (`RecordedAttendanceDaySource`). */
export type AttendanceDays = {
  daysBetween(
    workspaceId: string,
    memberIds: readonly string[],
    from: CalendarDate,
    to: CalendarDate,
  ): Promise<Map<string, AttendanceDay[]>>;
};

export type TodayView = {
  today: CalendarDate;
  timeZone: string;
  member: HrmsEmployee;
  gpsRequirement: GpsRequirement;
  /** How many fences apply to the member (0 = "Office location is not configured"). */
  fenceCount: number;
  shift: EffectiveShift;
  holidayName: string | null;
  day: AttendanceDay;
  state: LiveState;
  /** Today's entries, by check-in. */
  entries: StoredAttendanceEntry[];
  /** The member's open entry, of any date. */
  open: StoredAttendanceEntry | null;
  /** Check Out can close `open` now; false means it needs a missed checkout. */
  openNow: boolean;
  /** The member's entries waiting for approval. */
  pending: StoredAttendanceEntry[];
  canCreate: boolean;
};

export type PendingApproval = {
  entry: StoredAttendanceEntry;
  member: HrmsEmployee | null;
};

export type TeamTodayItem = {
  member: HrmsEmployee;
  state: LiveState;
  late: boolean;
  firstCheckInAt: Date | null;
  lastCheckOutAt: Date | null;
  workedHours: number;
  /** An entry is still open from an earlier day (needs a missed checkout). */
  openFromEarlierDay: boolean;
  /** One of today's entries was accepted outside every fence. */
  outOfFence: boolean;
};

export type TeamToday = {
  today: CalendarDate;
  items: TeamTodayItem[];
  counts: Record<LiveState, number> & { all: number; late: number };
};

export type MonthlyRow = {
  member: HrmsEmployee;
  days: AttendanceDay[];
  counts: DayCounts;
};

export type MonthlySummary = {
  month: MonthKey;
  today: CalendarDate;
  rows: MonthlyRow[];
};

const MENU = "hrms.attendance";

function times(shift: EffectiveShift | null): ShiftTimes {
  return shift?.startTime == null || shift.endTime == null
    ? null
    : { startTime: shift.startTime, endTime: shift.endTime };
}

function invalid(code: string, message: string, field: string): DomainError {
  return new DomainError(code, message, { details: { field } });
}

/**
 * Attendance (CM-308, CM-309): check in and out with GPS, a missed
 * checkout, a back-dated day, approvals, Team Today and the monthly
 * summary. Menu `hrms.attendance`: `read` (My Attendance), `create`
 * (the member's own check-in, check-out, missed checkout and back-dated
 * day), `view_all` (Team Today, team members), `approve` / `reject`
 * (Attendance Approvals), `report` (monthly summary) and `export`
 * (monthly Excel). Without `view_all` the monthly summary has only the
 * member's own row. Every change is audited; a month whose salary is
 * approved is closed (`MONTH_LOCKED`, ADR CM-0012 §17).
 */
export class AttendanceHandlers {
  private readonly clock: () => Date;

  constructor(
    private readonly deps: {
      store: AttendanceStore;
      employees: EmployeeDirectory;
      settings: HrmsSettingsReader;
      fences: FenceReader;
      shifts: EffectiveShiftResolver;
      calendar: WorkCalendar;
      days: AttendanceDays;
      monthLock: MonthLock;
      guard: AttendanceBackdatedGuard;
      timeZone: (workspaceId: string) => Promise<string>;
      clock?: () => Date;
    },
  ) {
    this.clock = deps.clock ?? (() => new Date());
  }

  private async me(access: MemberAccess): Promise<HrmsEmployee> {
    const member = await this.deps.employees.findByUserId(
      access.workspaceId,
      access.userId,
    );
    if (member == null)
      throw notFound(
        "TEAM_MEMBER_NOT_FOUND",
        "You are not a Team Member of this Company.",
      );
    return member;
  }

  private async moment(workspaceId: string) {
    const now = this.clock();
    const timeZone = await this.deps.timeZone(workspaceId);
    const local = localDateTime(now, timeZone);
    return { now, timeZone, local, today: local.date };
  }

  private async entry(
    workspaceId: string,
    id: string,
  ): Promise<StoredAttendanceEntry> {
    const found = await this.deps.store.find(workspaceId, id);
    if (found == null)
      throw notFound(
        "ATTENDANCE_NOT_FOUND",
        "This attendance entry does not exist.",
      );
    return found;
  }

  /** Whether Check Out can still close `open` now. */
  private async openNow(
    workspaceId: string,
    open: StoredAttendanceEntry,
    moment: { now: Date; local: ReturnType<typeof localDateTime> },
  ): Promise<boolean> {
    if (open.date === moment.local.date) return true;
    if (open.date !== addDays(moment.local.date, -1)) return false;
    const shift = await this.deps.shifts.shiftFor(
      workspaceId,
      open.memberId,
      open.date,
    );
    return canCheckOutNow(open, moment.now, moment.local, times(shift));
  }

  /** My Attendance: today's card, entries, the open entry and pending requests. */
  async today(input: { access: MemberAccess }): Promise<TodayView> {
    assertCan(input.access, MENU, "read");
    const { workspaceId } = input.access;
    const member = await this.me(input.access);
    const moment = await this.moment(workspaceId);
    const { today } = moment;
    const [settings, fences, shift, holiday, days, entries, open, pending] =
      await Promise.all([
        this.deps.settings.settingsFor(workspaceId),
        this.deps.fences.fencesFor(workspaceId, member.memberId),
        this.deps.shifts.shiftFor(workspaceId, member.memberId, today),
        this.deps.calendar.holidayFor(workspaceId, member.memberId, today),
        this.deps.days.daysBetween(
          workspaceId,
          [member.memberId],
          today,
          today,
        ),
        this.deps.store.entriesBetween(
          workspaceId,
          [member.memberId],
          today,
          today,
        ),
        this.deps.store.openEntry(workspaceId, member.memberId),
        this.deps.store.pending(workspaceId, member.memberId),
      ]);
    const day = days.get(member.memberId)?.[0];
    if (day == null) throw new Error("No attendance day for today.");
    const openNow =
      open == null ? false : await this.openNow(workspaceId, open, moment);
    return {
      today,
      timeZone: moment.timeZone,
      member,
      gpsRequirement: settings.gpsRequirement,
      fenceCount: fences.length,
      shift,
      holidayName: holiday?.name ?? null,
      day,
      state: liveState({
        kind:
          day.status === "holiday" || day.status === "week_off"
            ? day.status
            : "working",
        fullDayLeave: day.status === "on_leave" && day.leave?.half !== true,
        entries,
        openNow,
      }),
      entries,
      open,
      openNow,
      pending,
      canCreate: can(input.access, MENU, "create"),
    };
  }

  /** Check In (ADR CM-0012 §1, §3): GPS rules, the open-entry guard, month lock. */
  async checkIn(input: {
    access: MemberAccess;
    location: {
      latitude?: number | null;
      longitude?: number | null;
      accuracyMetres?: number | null;
    };
  }): Promise<StoredAttendanceEntry> {
    assertCan(input.access, MENU, "create");
    const { workspaceId, userId } = input.access;
    const member = await this.me(input.access);
    const fix = readGpsFix(input.location);
    const [settings, fences, open] = await Promise.all([
      this.deps.settings.settingsFor(workspaceId),
      this.deps.fences.fencesFor(workspaceId, member.memberId),
      this.deps.store.openEntry(workspaceId, member.memberId),
    ]);
    if (open != null) throw attendanceAlreadyOpen(open);
    const decision = decideCheckIn(settings.gpsRequirement, fences, fix);
    const { now, local } = await this.moment(workspaceId);
    const previous = await this.deps.shifts.shiftFor(
      workspaceId,
      member.memberId,
      addDays(local.date, -1),
    );
    const date = attendanceDateOf(local, times(previous));
    await this.deps.monthLock.assertOpen(workspaceId, member.memberId, date);
    return this.deps.store.create({
      workspaceId,
      entry: {
        memberId: member.memberId,
        date,
        checkInAt: now,
        checkIn: fix,
        checkInBranchId: decision.branchId,
        checkOutAt: null,
        checkOut: null,
        checkOutBranchId: null,
        source: "check_in",
        approvalStatus: decision.approvalStatus,
        outOfFence: decision.outOfFence,
        reason: null,
      },
      overlap: { from: now, to: new Date(now.getTime() + 1) },
      action: "hrms_attendance.checked_in",
      by: userId,
      now,
    });
  }

  /** Check Out: closes the open entry of today (or last night's shift). */
  async checkOut(input: {
    access: MemberAccess;
    location: {
      latitude?: number | null;
      longitude?: number | null;
      accuracyMetres?: number | null;
    };
  }): Promise<StoredAttendanceEntry> {
    assertCan(input.access, MENU, "create");
    const { workspaceId, userId } = input.access;
    const member = await this.me(input.access);
    const fix = readGpsFix(input.location);
    const open = await this.deps.store.openEntry(workspaceId, member.memberId);
    if (open == null)
      throw conflict(
        "NO_OPEN_ATTENDANCE",
        "You are not checked in. Check in first.",
      );
    const { now, local } = await this.moment(workspaceId);
    const shift = await this.deps.shifts.shiftFor(
      workspaceId,
      member.memberId,
      open.date,
    );
    assertCanCheckOut(open, now, local, times(shift));
    await this.deps.monthLock.assertOpen(
      workspaceId,
      member.memberId,
      open.date,
    );
    const fences =
      fix == null
        ? []
        : await this.deps.fences.fencesFor(workspaceId, member.memberId);
    const match =
      fix == null ? null : matchFence(fences, fix, fix.accuracyMetres);
    return this.deps.store.update({
      workspaceId,
      id: open.id,
      expectedUpdatedAt: open.updatedAt,
      changes: {
        checkOutAt: now,
        checkOut: fix,
        checkOutBranchId: match?.fence.id ?? null,
      },
      overlap: null,
      action: "hrms_attendance.checked_out",
      by: userId,
      now,
    });
  }

  /**
   * Add Missed Checkout: closes the member's entry left open on an
   * earlier day; it goes to approvals.
   */
  async addMissedCheckout(input: {
    access: MemberAccess;
    entryId: string;
    checkOutDate: string;
    checkOutTime: string;
    reason: string;
    expectedUpdatedAt: Date;
  }): Promise<StoredAttendanceEntry> {
    assertCan(input.access, MENU, "create");
    const { workspaceId, userId } = input.access;
    const member = await this.me(input.access);
    const entry = await this.entry(workspaceId, input.entryId);
    if (entry.memberId !== member.memberId)
      throw notFound(
        "ATTENDANCE_NOT_FOUND",
        "This attendance entry does not exist.",
      );
    if (!isCalendarDate(input.checkOutDate))
      throw invalid(
        "CHECK_OUT_DATE_INVALID",
        "Choose the checkout date.",
        "checkOutDate",
      );
    if (!isShiftTime(input.checkOutTime))
      throw invalid(
        "CHECK_OUT_TIME_INVALID",
        "Enter the checkout time as HH:MM, 24-hour.",
        "checkOutTime",
      );
    const reason = readReason(input.reason);
    const { now, timeZone, today } = await this.moment(workspaceId);
    const at = instantAt(input.checkOutDate, input.checkOutTime, timeZone);
    assertMissedCheckout(entry, at, now, today);
    await this.deps.monthLock.assertOpen(
      workspaceId,
      member.memberId,
      entry.date,
    );
    return this.deps.store.update({
      workspaceId,
      id: entry.id,
      expectedUpdatedAt: input.expectedUpdatedAt,
      changes: {
        checkOutAt: at,
        source: "missed_checkout",
        approvalStatus: "pending",
        reason,
        decidedBy: null,
        decidedAt: null,
      },
      overlap: { from: entry.checkInAt, to: at, exceptId: entry.id },
      action: "hrms_attendance.missed_checkout_added",
      by: userId,
      now,
    });
  }

  /**
   * Add Backdated Attendance: a past day's check-in and check-out, the
   * Back-dated Entry check for `hrms_attendance`; it goes to approvals.
   */
  async addManual(input: {
    access: MemberAccess;
    date: string;
    checkInTime: string;
    checkOutTime: string;
    reason: string;
  }): Promise<StoredAttendanceEntry> {
    assertCan(input.access, MENU, "create");
    const { workspaceId, userId } = input.access;
    const member = await this.me(input.access);
    const { now, timeZone, today } = await this.moment(workspaceId);
    const span = manualEntryTimes(input, today, timeZone);
    const reason = readReason(input.reason);
    const check = await this.deps.guard.forActor(input.access);
    check(span.date);
    await this.deps.monthLock.assertOpen(
      workspaceId,
      member.memberId,
      span.date,
    );
    return this.deps.store.create({
      workspaceId,
      entry: {
        memberId: member.memberId,
        date: span.date,
        checkInAt: span.checkInAt,
        checkIn: null,
        checkInBranchId: null,
        checkOutAt: span.checkOutAt,
        checkOut: null,
        checkOutBranchId: null,
        source: "manual",
        approvalStatus: "pending",
        outOfFence: false,
        reason,
      },
      overlap: { from: span.checkInAt, to: span.checkOutAt },
      action: "hrms_attendance.manual_added",
      by: userId,
      now,
    });
  }

  /**
   * Attendance Approvals: pending entries, oldest first. A member who is
   * not the Owner does not see their own (they cannot decide them).
   */
  async approvals(input: { access: MemberAccess }): Promise<PendingApproval[]> {
    const { access } = input;
    if (!can(access, MENU, "approve") && !can(access, MENU, "reject"))
      assertCan(access, MENU, "approve");
    const viewer =
      access.role === "owner"
        ? null
        : await this.deps.employees.findByUserId(
            access.workspaceId,
            access.userId,
          );
    const pending = (await this.deps.store.pending(access.workspaceId)).filter(
      (entry) => entry.memberId !== viewer?.memberId,
    );
    const members = await this.deps.employees.find(
      access.workspaceId,
      pending.map((entry) => entry.memberId),
    );
    return pending.map((entry) => ({
      entry,
      member: members.get(entry.memberId) ?? null,
    }));
  }

  private async decide(input: {
    access: MemberAccess;
    id: string;
    expectedUpdatedAt: Date;
    outcome: "approved" | "rejected";
    rejectionReason: string | null;
  }): Promise<StoredAttendanceEntry> {
    const { access } = input;
    assertCan(
      access,
      MENU,
      input.outcome === "approved" ? "approve" : "reject",
    );
    const entry = await this.entry(access.workspaceId, input.id);
    const decider =
      access.role === "owner"
        ? null
        : await this.deps.employees.findByUserId(
            access.workspaceId,
            access.userId,
          );
    assertCanDecide(entry, {
      memberId: decider?.memberId ?? null,
      isOwner: access.role === "owner",
    });
    await this.deps.monthLock.assertOpen(
      access.workspaceId,
      entry.memberId,
      entry.date,
    );
    const now = this.clock();
    return this.deps.store.update({
      workspaceId: access.workspaceId,
      id: entry.id,
      expectedUpdatedAt: input.expectedUpdatedAt,
      changes: {
        approvalStatus: input.outcome,
        decidedBy: access.userId,
        decidedAt: now,
        rejectionReason: input.rejectionReason,
      },
      overlap: null,
      action:
        input.outcome === "approved"
          ? "hrms_attendance.approved"
          : "hrms_attendance.rejected",
      by: access.userId,
      now,
    });
  }

  approve(input: {
    access: MemberAccess;
    id: string;
    expectedUpdatedAt: Date;
  }): Promise<StoredAttendanceEntry> {
    return this.decide({
      ...input,
      outcome: "approved",
      rejectionReason: null,
    });
  }

  reject(input: {
    access: MemberAccess;
    id: string;
    expectedUpdatedAt: Date;
    reason: string;
  }): Promise<StoredAttendanceEntry> {
    const reason = readReason(input.reason, "rejectionReason");
    return this.decide({
      ...input,
      outcome: "rejected",
      rejectionReason: reason,
    });
  }

  /** Active Team Members the viewer can see (`view_all`), by name. */
  async teamMembers(input: { access: MemberAccess }): Promise<HrmsEmployee[]> {
    assertCan(input.access, MENU, "view_all");
    return (await this.deps.employees.list(input.access.workspaceId)).filter(
      (member) => member.active,
    );
  }

  /** Team Today: where each active Team Member stands now, with counts. */
  async teamToday(input: { access: MemberAccess }): Promise<TeamToday> {
    assertCan(input.access, MENU, "view_all");
    const { workspaceId } = input.access;
    const members = await this.teamMembers(input);
    const moment = await this.moment(workspaceId);
    const { today } = moment;
    const ids = members.map((member) => member.memberId);
    const [days, entries, opens] = await Promise.all([
      this.deps.days.daysBetween(workspaceId, ids, today, today),
      this.deps.store.entriesBetween(workspaceId, ids, today, today),
      this.deps.store.openEntries(workspaceId),
    ]);
    const openOf = new Map(opens.map((open) => [open.memberId, open]));
    const counts: TeamToday["counts"] = {
      all: 0,
      late: 0,
      checked_in: 0,
      checked_out: 0,
      not_checked_in: 0,
      on_leave: 0,
      holiday: 0,
      week_off: 0,
    };
    const items: TeamTodayItem[] = [];
    for (const member of members) {
      const day = days.get(member.memberId)?.[0];
      if (day == null) continue;
      const mine = entries.filter(
        (entry) =>
          entry.memberId === member.memberId &&
          entry.approvalStatus !== "rejected",
      );
      const open = openOf.get(member.memberId) ?? null;
      const openNow =
        open == null ? false : await this.openNow(workspaceId, open, moment);
      const state = liveState({
        kind:
          day.status === "holiday" || day.status === "week_off"
            ? day.status
            : "working",
        fullDayLeave: day.status === "on_leave" && day.leave?.half !== true,
        entries: mine,
        openNow,
      });
      const outs = mine.flatMap((entry) =>
        entry.checkOutAt == null ? [] : [entry.checkOutAt.getTime()],
      );
      items.push({
        member,
        state,
        late: day.late,
        firstCheckInAt:
          mine.length === 0
            ? null
            : new Date(
                Math.min(...mine.map((entry) => entry.checkInAt.getTime())),
              ),
        lastCheckOutAt:
          outs.length === 0 || openNow ? null : new Date(Math.max(...outs)),
        workedHours: day.workedHours,
        openFromEarlierDay: open != null && !openNow,
        outOfFence: mine.some((entry) => entry.outOfFence),
      });
      counts.all += 1;
      counts[state] += 1;
      if (day.late) counts.late += 1;
    }
    return { today, items, counts };
  }

  private async monthRows(
    access: MemberAccess,
    month: string,
  ): Promise<MonthlySummary> {
    const key = assertMonthKey(month, "MONTH_INVALID");
    const { workspaceId } = access;
    const members = can(access, MENU, "view_all")
      ? (await this.deps.employees.list(workspaceId)).filter(
          (member) => member.active,
        )
      : [await this.me(access)];
    const { today } = await this.moment(workspaceId);
    const days = await this.deps.days.daysBetween(
      workspaceId,
      members.map((member) => member.memberId),
      firstDayOf(key),
      lastDayOf(key),
    );
    return {
      month: key,
      today,
      rows: members.map((member) => {
        const list = days.get(member.memberId) ?? [];
        // Days after today have not happened: they do not count.
        const counted = list.filter((day) => day.date <= today);
        return { member, days: list, counts: countDays(counted) };
      }),
    };
  }

  /**
   * The monthly summary (`report`): each member's days and counts. Days
   * after today are listed but not counted. Everyone with `view_all`,
   * else the member's own row.
   */
  async monthlySummary(input: {
    access: MemberAccess;
    month: string;
  }): Promise<MonthlySummary> {
    assertCan(input.access, MENU, "report");
    return this.monthRows(input.access, input.month);
  }

  /** The monthly report's data, for the Excel download (`export`). */
  async monthlyReport(input: {
    access: MemberAccess;
    month: string;
  }): Promise<MonthlySummary> {
    assertCan(input.access, MENU, "export");
    return this.monthRows(input.access, input.month);
  }
}
