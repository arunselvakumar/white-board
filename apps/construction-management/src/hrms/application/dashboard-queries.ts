import { assertCan, can, type MemberAccess } from "@/src/shared-kernel/access";
import { addDays, type CalendarDate } from "@/src/shared-kernel/calendar-date";

import type { DayStatus, LiveState } from "../domain/attendance";
import {
  countBuckets,
  dashboardBucket,
  DASHBOARD_LEAVE_DAYS,
  DASHBOARD_LIST_LIMIT,
  DASHBOARD_TREND_DAYS,
  dayWiseTrend,
  type DashboardDayCounts,
} from "../domain/dashboard";
import type { HolidayType } from "../domain/holiday";
import type { LeaveRequestStatus } from "../domain/leave-request";
import type {
  AttendanceDays,
  AttendanceHandlers,
  StoredAttendanceEntry,
} from "./attendance-handlers";
import type { HolidayHandlers } from "./holiday-handlers";
import type { LeaveBalanceHandlers } from "./leave-balance-handlers";
import type {
  LeaveRequestHandlers,
  LeaveRequestReadModel,
} from "./leave-request-handlers";
import type { EmployeeDirectory } from "./ports";

const ATTENDANCE = "hrms.attendance" as const;
const LEAVES = "hrms.leaves" as const;
const HOLIDAYS = "hrms.holidays" as const;

/** How many pending leave requests are read to find the ones the caller may decide. */
const PENDING_READ_LIMIT = 500;

/** How many holidays the dashboard lists. */
const HOLIDAY_LIMIT = 4;

export type DashboardPermissions = {
  /** `hrms.attendance` View All: the team's snapshot, breakdown and trend. */
  viewTeam: boolean;
  /** `hrms.attendance` create: Check In. */
  checkIn: boolean;
  /** `hrms.leaves` create: Apply Leave. */
  applyLeave: boolean;
  /** Approve or reject on `hrms.attendance`. */
  approveAttendance: boolean;
  /** Approve or reject on `hrms.leaves`. */
  approveLeave: boolean;
  /** `hrms.leaves` View All: upcoming team leaves. */
  viewTeamLeaves: boolean;
  /** `hrms.holidays` read. */
  viewHolidays: boolean;
};

export type DashboardTeam = {
  /** Active Team Members (joined, not removed). */
  employees: number;
  /** Present or half day so far, checked in now included. */
  presentToday: number;
  onLeave: number;
  /** Working today, no full day of leave, no check-in yet. */
  notCheckedIn: number;
  late: number;
  breakdown: DashboardDayCounts;
  /** The last 14 Company dates, oldest first; today as of now. */
  trend: (DashboardDayCounts & { date: CalendarDate })[];
};

export type DashboardApprovalItem = {
  kind: "attendance" | "leave" | "cancellation";
  id: string;
  memberName: string;
  /** "Back-dated day", "Casual Leave"… */
  title: string;
  fromDate: CalendarDate;
  toDate: CalendarDate;
  /** Leave days; null for attendance. */
  days: number | null;
  /** When it was asked for. */
  requestedAt: Date;
};

export type DashboardApprovals = {
  total: number;
  /** Null when the caller cannot decide that kind. */
  attendance: number | null;
  leave: number | null;
  cancellations: number | null;
  /** The oldest first, at most five. */
  items: DashboardApprovalItem[];
};

export type DashboardLeave = {
  id: string;
  memberName: string;
  leaveTypeName: string;
  fromDate: CalendarDate;
  toDate: CalendarDate;
  totalDays: number;
  status: LeaveRequestStatus;
};

export type DashboardHoliday = {
  id: string;
  name: string;
  date: CalendarDate;
  type: HolidayType;
  isOptional: boolean;
};

export type DashboardMyDay = {
  state: LiveState;
  status: DayStatus;
  shiftName: string;
  holidayName: string | null;
  firstCheckInAt: Date | null;
  lastCheckOutAt: Date | null;
  workedHours: number;
  late: boolean;
  /** An entry is still open from an earlier day (needs a missed checkout). */
  openFromEarlierDay: boolean;
};

export type DashboardMyBalance = {
  leaveTypeId: string;
  leaveTypeName: string;
  isPaid: boolean;
  entitlement: number;
  available: number;
  pending: number;
};

export type DashboardMe = {
  memberId: string;
  name: string;
  /** Null without `hrms.attendance` read. */
  today: DashboardMyDay | null;
  /** Null without `hrms.leaves` read. */
  leaveYear: string | null;
  balances: DashboardMyBalance[] | null;
  /** The caller's own requests waiting for a decision. */
  pending: {
    attendance: number | null;
    leave: number | null;
    items: DashboardApprovalItem[];
  };
};

export type HrmsDashboard = {
  today: CalendarDate;
  timeZone: string;
  permissions: DashboardPermissions;
  /** Null without `hrms.attendance` View All. */
  team: DashboardTeam | null;
  /** Null when the caller may decide neither attendance nor leave. */
  approvals: DashboardApprovals | null;
  /** The next 14 days, today included; null without `hrms.leaves` View All. */
  teamLeaves: { total: number; items: DashboardLeave[] } | null;
  /** The next few from today; null without `hrms.holidays` read. */
  holidays: DashboardHoliday[] | null;
  /** Null when the caller is not a Team Member of the Company. */
  me: DashboardMe | null;
};

/**
 * What the dashboard reads, as the slices of the attendance (CM-308),
 * leave (CM-312) and holiday (CM-305) services it composes. Each keeps its
 * own permission check; the dashboard calls only what the caller holds.
 */
export type DashboardSources = {
  employees: EmployeeDirectory;
  days: AttendanceDays;
  attendance: Pick<AttendanceHandlers, "teamToday" | "today" | "approvals">;
  leaveRequests: Pick<LeaveRequestHandlers, "approvals" | "team" | "listMine">;
  leaveBalances: Pick<LeaveBalanceHandlers, "memberBalances">;
  holidays: Pick<HolidayHandlers, "list">;
  /** Today in the Company's time zone, and the zone. */
  moment: (
    workspaceId: string,
  ) => Promise<{ today: CalendarDate; timeZone: string }>;
};

const ATTENDANCE_TITLES: Record<StoredAttendanceEntry["source"], string> = {
  check_in: "Check-in outside the fence",
  manual: "Back-dated day",
  missed_checkout: "Missed checkout",
};

function attendanceItem(
  entry: StoredAttendanceEntry,
  memberName: string,
): DashboardApprovalItem {
  return {
    kind: "attendance",
    id: entry.id,
    memberName,
    title: ATTENDANCE_TITLES[entry.source],
    fromDate: entry.date,
    toDate: entry.date,
    days: null,
    requestedAt: entry.updatedAt,
  };
}

function leaveItem(
  request: LeaveRequestReadModel,
  kind: "leave" | "cancellation",
): DashboardApprovalItem {
  return {
    kind,
    id: request.id,
    memberName: request.memberName,
    title:
      kind === "cancellation"
        ? `Cancel ${request.leaveTypeName}`
        : request.leaveTypeName,
    fromDate: request.fromDate,
    toDate: request.toDate,
    days: request.totalDays,
    requestedAt: request.updatedAt,
  };
}

function oldestFirst(items: DashboardApprovalItem[]): DashboardApprovalItem[] {
  return items
    .slice()
    .sort((a, b) => a.requestedAt.getTime() - b.requestedAt.getTime())
    .slice(0, DASHBOARD_LIST_LIMIT);
}

/**
 * The HRMS Dashboard (CM-319, `modules/11` "HRMS dashboard"): today's
 * snapshot, the present/absent breakdown and the 14-day trend (View All on
 * attendance), what waits for the caller's decision (approve or reject on
 * attendance or leave), upcoming team leaves (View All on leave), upcoming
 * holidays (holidays read) and the caller's own day, balances and pending
 * requests. Needs `hrms.hrms` read; every section needs its own flag and
 * is null without it, so a Team Member sees only what they could open.
 */
export class HrmsDashboardQueries {
  constructor(private readonly sources: DashboardSources) {}

  async dashboard(access: MemberAccess): Promise<HrmsDashboard> {
    assertCan(access, "hrms.hrms", "read");
    const permissions: DashboardPermissions = {
      viewTeam: can(access, ATTENDANCE, "view_all"),
      checkIn: can(access, ATTENDANCE, "create"),
      applyLeave: can(access, LEAVES, "create"),
      approveAttendance:
        can(access, ATTENDANCE, "approve") || can(access, ATTENDANCE, "reject"),
      approveLeave:
        can(access, LEAVES, "approve") || can(access, LEAVES, "reject"),
      viewTeamLeaves: can(access, LEAVES, "view_all"),
      viewHolidays: can(access, HOLIDAYS, "read"),
    };
    const { today, timeZone } = await this.sources.moment(access.workspaceId);
    const [team, approvals, teamLeaves, holidays, me] = await Promise.all([
      permissions.viewTeam ? this.team(access) : null,
      permissions.approveAttendance || permissions.approveLeave
        ? this.approvals(access, permissions)
        : null,
      permissions.viewTeamLeaves ? this.teamLeaves(access, today) : null,
      permissions.viewHolidays ? this.holidays(access, today) : null,
      this.me(access),
    ]);
    return {
      today: team?.today ?? today,
      timeZone,
      permissions,
      team: team?.team ?? null,
      approvals,
      teamLeaves,
      holidays,
      me,
    };
  }

  /** Team Today plus the members' day statuses over the last 14 days. */
  private async team(
    access: MemberAccess,
  ): Promise<{ today: CalendarDate; team: DashboardTeam }> {
    const teamToday = await this.sources.attendance.teamToday({ access });
    const { today } = teamToday;
    const ids = teamToday.items.map((item) => item.member.memberId);
    const from = addDays(today, -(DASHBOARD_TREND_DAYS - 1));
    const days = await this.sources.days.daysBetween(
      access.workspaceId,
      ids,
      from,
      today,
    );
    const liveToday = new Map(
      teamToday.items.map((item) => [item.member.memberId, item.state]),
    );
    const trend = dayWiseTrend({
      dates: Array.from({ length: DASHBOARD_TREND_DAYS }, (_, index) =>
        addDays(from, index),
      ),
      daysByMember: days,
      today,
      liveToday,
    });
    const breakdown = countBuckets(
      teamToday.items.flatMap((item) => {
        const day = days
          .get(item.member.memberId)
          ?.find((each) => each.date === today);
        return day == null ? [] : [dashboardBucket(day.status, item.state)];
      }),
    );
    return {
      today,
      team: {
        employees: teamToday.counts.all,
        presentToday: breakdown.present + breakdown.halfDay,
        onLeave: breakdown.onLeave,
        notCheckedIn: teamToday.counts.not_checked_in,
        late: teamToday.counts.late,
        breakdown,
        trend,
      },
    };
  }

  /** What the caller may decide now: attendance entries, leave, cancellations. */
  private async approvals(
    access: MemberAccess,
    permissions: DashboardPermissions,
  ): Promise<DashboardApprovals> {
    const [attendance, pending, cancellations] = await Promise.all([
      permissions.approveAttendance
        ? this.sources.attendance.approvals({ access })
        : null,
      permissions.approveLeave
        ? this.sources.leaveRequests.approvals(access, {
            tab: "pending",
            limit: PENDING_READ_LIMIT,
          })
        : null,
      permissions.approveLeave
        ? this.sources.leaveRequests.approvals(access, {
            tab: "cancel_requests",
            limit: PENDING_READ_LIMIT,
          })
        : null,
    ]);
    const leave = pending?.items.filter((item) => item.canDecide) ?? null;
    const cancel =
      cancellations?.items.filter((item) => item.canDecide) ?? null;
    const items = [
      ...(attendance?.items.map(({ entry, member }) =>
        attendanceItem(entry, member?.name ?? "—"),
      ) ?? []),
      ...(leave?.map((request) => leaveItem(request, "leave")) ?? []),
      ...(cancel?.map((request) => leaveItem(request, "cancellation")) ?? []),
    ];
    return {
      total: items.length,
      attendance: attendance?.items.length ?? null,
      leave: leave?.length ?? null,
      cancellations: cancel?.length ?? null,
      items: oldestFirst(items),
    };
  }

  /** Approved and pending leave with a day in the next 14 days. */
  private async teamLeaves(
    access: MemberAccess,
    today: CalendarDate,
  ): Promise<{ total: number; items: DashboardLeave[] }> {
    const { items } = await this.sources.leaveRequests.team(access, {
      from: today,
      to: addDays(today, DASHBOARD_LEAVE_DAYS - 1),
    });
    const sorted = items
      .slice()
      .sort(
        (a, b) =>
          a.fromDate.localeCompare(b.fromDate) ||
          a.memberName.localeCompare(b.memberName),
      );
    return {
      total: sorted.length,
      items: sorted.slice(0, DASHBOARD_LIST_LIMIT).map((request) => ({
        id: request.id,
        memberName: request.memberName,
        leaveTypeName: request.leaveTypeName,
        fromDate: request.fromDate,
        toDate: request.toDate,
        totalDays: request.totalDays,
        status: request.status,
      })),
    };
  }

  /** The next holidays from today, this year and next. */
  private async holidays(
    access: MemberAccess,
    today: CalendarDate,
  ): Promise<DashboardHoliday[]> {
    const year = Number(today.slice(0, 4));
    const years = await Promise.all(
      [year, year + 1].map((each) =>
        this.sources.holidays.list({ access, year: each }),
      ),
    );
    return years
      .flat()
      .filter((holiday) => holiday.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, HOLIDAY_LIMIT)
      .map((holiday) => ({
        id: holiday.id,
        name: holiday.name,
        date: holiday.date,
        type: holiday.type,
        isOptional: holiday.isOptional,
      }));
  }

  /** The caller's own day, leave balances and requests waiting for others. */
  private async me(access: MemberAccess): Promise<DashboardMe | null> {
    const member = await this.sources.employees.findByUserId(
      access.workspaceId,
      access.userId,
    );
    if (member == null) return null;
    const readsAttendance = can(access, ATTENDANCE, "read");
    const readsLeave = can(access, LEAVES, "read");
    const [view, balances, pendingLeave, pendingCancellations] =
      await Promise.all([
        readsAttendance ? this.sources.attendance.today({ access }) : null,
        readsLeave
          ? this.sources.leaveBalances.memberBalances(access, {})
          : null,
        readsLeave
          ? this.sources.leaveRequests.listMine(access, { status: "pending" })
          : null,
        readsLeave
          ? this.sources.leaveRequests.listMine(access, {
              status: "cancellation_requested",
            })
          : null,
      ]);
    let today: DashboardMyDay | null = null;
    if (view != null) {
      const live = view.entries.filter(
        (entry) => entry.approvalStatus !== "rejected",
      );
      const outs = live.flatMap((entry) =>
        entry.checkOutAt == null ? [] : [entry.checkOutAt.getTime()],
      );
      today = {
        state: view.state,
        status: view.day.status,
        shiftName: view.shift.name,
        holidayName: view.holidayName,
        firstCheckInAt:
          live.length === 0
            ? null
            : new Date(
                Math.min(...live.map((entry) => entry.checkInAt.getTime())),
              ),
        lastCheckOutAt:
          outs.length === 0 || view.state === "checked_in"
            ? null
            : new Date(Math.max(...outs)),
        workedHours: view.day.workedHours,
        late: view.day.late,
        openFromEarlierDay: view.open != null && !view.openNow,
      };
    }
    const leaveRequests = [
      ...(pendingLeave?.items.map((request) => leaveItem(request, "leave")) ??
        []),
      ...(pendingCancellations?.items.map((request) =>
        leaveItem(request, "cancellation"),
      ) ?? []),
    ];
    const items = [
      ...(view?.pending.map((entry) => attendanceItem(entry, member.name)) ??
        []),
      ...leaveRequests,
    ];
    return {
      memberId: member.memberId,
      name: member.name,
      today,
      leaveYear: balances?.leaveYear ?? null,
      balances:
        balances?.rows
          .filter(
            (row) =>
              row.isActive &&
              (row.entitlement > 0 || row.available !== 0 || row.pending > 0),
          )
          .map((row) => ({
            leaveTypeId: row.leaveTypeId,
            leaveTypeName: row.leaveTypeName,
            isPaid: row.isPaid,
            entitlement: row.entitlement,
            available: row.available,
            pending: row.pending,
          })) ?? null,
      pending: {
        attendance: view?.pending.length ?? null,
        leave: readsLeave ? leaveRequests.length : null,
        items: oldestFirst(items),
      },
    };
  }
}
