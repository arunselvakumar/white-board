import { describe, expect, it } from "vitest";

import { addDays, type CalendarDate } from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";

import { instantAt } from "../domain/company-time";
import type { ShiftBook } from "../domain/effective-shift";
import { DEFAULT_HRMS_SETTINGS } from "../domain/hrms-settings";
import type { LiveState } from "../domain/attendance";
import type { LeaveRequestStatus } from "../domain/leave-request";
import {
  RecordedAttendanceDaySource,
  type DayEntryRow,
} from "./attendance-days";
import type {
  StoredAttendanceEntry,
  TeamToday,
  TodayView,
} from "./attendance-handlers";
import {
  HrmsDashboardQueries,
  type DashboardSources,
} from "./dashboard-queries";
import type { StoredHoliday } from "./holiday-handlers";
import { accessFor } from "./hrms-fakes";
import type { MemberLeaveBalances } from "./leave-balance-handlers";
import type { LeaveRequestReadModel } from "./leave-request-handlers";
import type { HrmsEmployee, LeaveDay } from "./ports";

const IST = "Asia/Kolkata";
/** Saturday. The trend runs from Sunday 27 September. */
const TODAY = "2026-10-10";
const at = (date: string, time: string) => instantAt(date, time, IST);

function employee(memberId: string, name: string, userId: string) {
  return {
    memberId,
    userId,
    name,
    memberType: "normal",
    designationId: "d1",
    designationName: "Site Engineer",
    projectIds: [],
    active: true,
    isOwner: false,
  } satisfies HrmsEmployee;
}

// m1 is the Owner's Team Member; m2 and m3 are the team.
const M1 = employee("m1", "Arun Selva Kumar", "user-1");
const M2 = employee("m2", "Prabhu Saravanan", "user-2");
const M3 = employee("m3", "Meena Rajan", "user-3");
const TEAM = [M1, M2, M3];

/** Monday to Saturday, 09:00–18:00, 8 h; Sunday off. */
function book(): ShiftBook {
  return {
    settings: DEFAULT_HRMS_SETTINGS,
    assignments: [
      {
        id: "a1",
        shiftTemplateId: "general",
        rotationTemplateId: null,
        effectiveFrom: "2026-01-01",
        effectiveTo: null,
      },
    ],
    shifts: new Map([
      [
        "general",
        {
          id: "general",
          name: "General",
          startTime: "09:00",
          endTime: "18:00",
          workingDays: [1, 2, 3, 4, 5, 6],
          workingHours: 8,
          halfDayHours: 4,
          graceMinutes: 10,
          overtimeAllowed: false,
        },
      ],
    ]),
    rotations: new Map(),
  };
}

const TREND_FROM = addDays(TODAY, -13);
const TREND = Array.from({ length: 14 }, (_, index) =>
  addDays(TREND_FROM, index),
);
const SUNDAYS = new Set(["2026-09-27", "2026-10-04"]);
const GANDHI_JAYANTI = "2026-10-02";
const M3_LEAVE = ["2026-10-08", "2026-10-09", TODAY];

function closed(
  memberId: string,
  date: CalendarDate,
  from: string,
  to: string,
): DayEntryRow {
  return {
    memberId,
    date,
    checkInAt: at(date, from),
    checkOutAt: at(date, to),
    approvalStatus: "none",
  };
}

/**
 * The seeded fortnight: m1 works every full day and is checked in now;
 * m2 works half days on 5–7 October and is otherwise absent; m3 works
 * full days and is on leave from 8 October.
 */
function seededEntries(): DayEntryRow[] {
  const rows: DayEntryRow[] = [];
  for (const date of TREND) {
    if (date === TODAY) continue;
    rows.push(closed("m1", date, "09:00", "18:00"));
    if (["2026-10-05", "2026-10-06", "2026-10-07"].includes(date))
      rows.push(closed("m2", date, "09:00", "13:30"));
    if (!M3_LEAVE.includes(date))
      rows.push(closed("m3", date, "09:00", "17:30"));
  }
  // m1 checked in today and has not checked out.
  rows.push({
    memberId: "m1",
    date: TODAY,
    checkInAt: at(TODAY, "09:05"),
    checkOutAt: null,
    approvalStatus: "none",
  });
  return rows;
}

function days(entries: DayEntryRow[]) {
  return new RecordedAttendanceDaySource({
    books: {
      booksFor: (_workspaceId, memberIds) =>
        Promise.resolve(new Map(memberIds.map((id) => [id, book()]))),
    },
    holidays: {
      holidaysBetween: () =>
        Promise.resolve([
          {
            id: "h1",
            name: "Gandhi Jayanti",
            date: GANDHI_JAYANTI,
            type: "national" as const,
            isOptional: false,
          },
        ]),
    },
    entries: {
      entriesBetween: (_workspaceId, memberIds, from, to) =>
        Promise.resolve(
          entries.filter(
            (entry) =>
              memberIds.includes(entry.memberId) &&
              entry.date >= from &&
              entry.date <= to,
          ),
        ),
    },
    leave: {
      approvedForMonth: (_workspaceId, memberIds, month) =>
        Promise.resolve(
          new Map(
            memberIds.map((id) => [
              id,
              id === "m3"
                ? M3_LEAVE.filter((date) => date.startsWith(month)).map(
                    (date): LeaveDay => ({
                      date,
                      requestId: "r-m3",
                      leaveTypeId: "cl",
                      leaveTypeName: "Casual Leave",
                      isPaid: true,
                      session: "full",
                      days: 1,
                    }),
                  )
                : [],
            ]),
          ),
        ),
    },
    timeZone: () => Promise.resolve(IST),
  });
}

const LIVE: Record<string, LiveState> = {
  m1: "checked_in",
  m2: "not_checked_in",
  m3: "on_leave",
};

function teamToday(): TeamToday {
  return {
    today: TODAY,
    timeZone: IST,
    items: TEAM.map((member) => ({
      member,
      state: LIVE[member.memberId] ?? "not_checked_in",
      late: false,
      firstCheckInAt: member.memberId === "m1" ? at(TODAY, "09:05") : null,
      lastCheckOutAt: null,
      workedHours: 0,
      openFromEarlierDay: false,
      outOfFence: false,
    })),
    counts: {
      all: 3,
      late: 0,
      checked_in: 1,
      checked_out: 0,
      not_checked_in: 1,
      on_leave: 1,
      holiday: 0,
      week_off: 0,
    },
  };
}

function attendanceEntry(
  overrides: Partial<StoredAttendanceEntry>,
): StoredAttendanceEntry {
  return {
    id: "e1",
    memberId: "m2",
    date: "2026-10-06",
    checkInAt: at("2026-10-06", "09:00"),
    checkIn: null,
    checkInBranchId: null,
    checkOutAt: at("2026-10-06", "18:00"),
    checkOut: null,
    checkOutBranchId: null,
    source: "manual",
    approvalStatus: "pending",
    outOfFence: false,
    reason: "Forgot my phone at home",
    decidedBy: null,
    decidedAt: null,
    rejectionReason: null,
    createdBy: "user-2",
    createdAt: at("2026-10-07", "10:00"),
    updatedAt: at("2026-10-07", "10:00"),
    ...overrides,
  };
}

function leaveRequest(
  overrides: Partial<LeaveRequestReadModel>,
): LeaveRequestReadModel {
  return {
    id: "r1",
    memberId: "m2",
    leaveTypeId: "cl",
    fromDate: "2026-10-14",
    toDate: "2026-10-15",
    totalDays: 2,
    leaveYear: "2026",
    reason: "Family function in Madurai",
    status: "pending",
    approvalLevels: 1,
    currentLevel: 1,
    approvalRemarks: null,
    rejectionReason: null,
    cancellationReason: null,
    appliedByMemberId: "m2",
    days: [],
    createdAt: at("2026-10-08", "11:00"),
    updatedAt: at("2026-10-08", "11:00"),
    memberName: "Prabhu Saravanan",
    leaveTypeName: "Casual Leave",
    isPaid: true,
    appliedByName: "Prabhu Saravanan",
    decisions: [],
    canWithdraw: false,
    canRequestCancellation: false,
    canDecide: true,
    ...overrides,
  };
}

function today(member: HrmsEmployee): TodayView {
  const entry = attendanceEntry({
    id: "e-today",
    memberId: member.memberId,
    date: TODAY,
    checkInAt: at(TODAY, "09:20"),
    checkOutAt: null,
    source: "check_in",
    approvalStatus: "none",
  });
  return {
    today: TODAY,
    timeZone: IST,
    member,
    gpsRequirement: "disabled",
    fenceCount: 1,
    shift: {
      source: "shift",
      shiftTemplateId: "general",
      rotationTemplateId: null,
      name: "General",
      startTime: "09:00",
      endTime: "18:00",
      workingHours: 8,
      halfDayHours: 4,
      graceMinutes: 10,
      overtimeAllowed: false,
      isWorkingDay: true,
    },
    holidayName: null,
    day: {
      date: TODAY,
      status: "absent",
      workedHours: 0,
      overtimeHours: 0,
      overtimeAllowed: false,
      shiftWorkingHours: 8,
      late: true,
      leave: null,
    },
    state: "checked_in",
    entries: [entry],
    open: entry,
    openNow: true,
    pending: [
      attendanceEntry({
        id: "e-mine",
        memberId: member.memberId,
        updatedAt: at("2026-10-07", "12:00"),
      }),
    ],
    canCreate: true,
  };
}

function balances(member: HrmsEmployee): MemberLeaveBalances {
  const row = {
    initialised: true,
    opening: 12,
    accrued: 0,
    carriedForward: 0,
    adjusted: 0,
    used: 2,
    pending: 2,
    available: 8,
    lastAccrualPeriod: null,
    leaveTypeId: "cl",
    leaveTypeName: "Casual Leave",
    isPaid: true,
    accrualMode: "upfront" as const,
    isActive: true,
    allowAdvanceUse: false,
    entitlement: 12,
  };
  return {
    memberId: member.memberId,
    memberName: member.name,
    designationName: member.designationName,
    leaveYear: "2026",
    structureId: null,
    rows: [
      row,
      // An unpaid type with nothing in it is left out.
      {
        ...row,
        leaveTypeId: "lop",
        leaveTypeName: "Loss of Pay",
        isPaid: false,
        opening: 0,
        used: 0,
        pending: 0,
        available: 0,
        entitlement: 0,
      },
    ],
  };
}

const HOLIDAYS: StoredHoliday[] = [
  {
    id: "h1",
    name: "Gandhi Jayanti",
    date: GANDHI_JAYANTI,
    type: "national",
    isOptional: false,
    description: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "h2",
    name: "Diwali",
    date: "2026-11-08",
    type: "festival",
    isOptional: false,
    description: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

function notExpected(name: string): never {
  throw new Error(`${name} should not be read for this caller.`);
}

/** Every source over the seeded fortnight; `calls` records which ran. */
function sources(overrides: Partial<DashboardSources> = {}) {
  const calls: string[] = [];
  const byUser = new Map(TEAM.map((member) => [member.userId, member]));
  const base: DashboardSources = {
    employees: {
      list: () => Promise.resolve(TEAM),
      find: (_workspaceId, ids) =>
        Promise.resolve(
          new Map(
            TEAM.filter((member) => ids.includes(member.memberId)).map(
              (member) => [member.memberId, member],
            ),
          ),
        ),
      findByUserId: (_workspaceId, userId) =>
        Promise.resolve(byUser.get(userId) ?? null),
    },
    days: days(seededEntries()),
    attendance: {
      teamToday: () => {
        calls.push("teamToday");
        return Promise.resolve(teamToday());
      },
      today: ({ access }) => {
        calls.push("today");
        const member = byUser.get(access.userId);
        if (member == null) throw new Error("Not a Team Member");
        return Promise.resolve(today(member));
      },
      approvals: () => {
        calls.push("attendanceApprovals");
        return Promise.resolve({
          timeZone: IST,
          items: [
            {
              entry: attendanceEntry({}),
              member: M2,
            },
          ],
        });
      },
    },
    leaveRequests: {
      approvals: (_access, input) => {
        calls.push(`leaveApprovals:${input.tab}`);
        const items =
          input.tab === "pending"
            ? [
                leaveRequest({}),
                // Level 1 decided by this approver already: not theirs now.
                leaveRequest({ id: "r2", canDecide: false }),
              ]
            : [
                leaveRequest({
                  id: "r3",
                  memberId: "m3",
                  memberName: "Meena Rajan",
                  status: "cancellation_requested",
                  updatedAt: at("2026-10-06", "09:00"),
                }),
              ];
        return Promise.resolve({
          items,
          total: items.length,
          counts: {
            pending: 2,
            approved: 0,
            rejected: 0,
            cancel_requests: 1,
          },
        });
      },
      team: (_access, input) => {
        calls.push(`team:${input.from}..${input.to}`);
        return Promise.resolve({
          items: [
            leaveRequest({
              id: "r4",
              memberId: "m3",
              memberName: "Meena Rajan",
              fromDate: "2026-10-08",
              toDate: "2026-10-12",
              totalDays: 3,
              status: "approved",
            }),
            leaveRequest({}),
          ],
          total: 2,
        });
      },
      listMine: (_access, input) => {
        calls.push(`mine:${input.status ?? "all"}`);
        const status: LeaveRequestStatus | undefined = input.status;
        return Promise.resolve(
          status === "pending"
            ? {
                items: [
                  leaveRequest({
                    id: "r-mine",
                    updatedAt: at("2026-10-09", "08:00"),
                  }),
                ],
                total: 1,
              }
            : { items: [], total: 0 },
        );
      },
    },
    leaveBalances: {
      memberBalances: (access) => {
        calls.push("balances");
        const member = byUser.get(access.userId);
        if (member == null) throw new Error("Not a Team Member");
        return Promise.resolve(balances(member));
      },
    },
    holidays: {
      list: ({ year }) => {
        calls.push(`holidays:${String(year)}`);
        return Promise.resolve(
          HOLIDAYS.filter((holiday) => holiday.date.startsWith(String(year))),
        );
      },
    },
    moment: () => Promise.resolve({ today: TODAY, timeZone: IST }),
  };
  return {
    calls,
    queries: new HrmsDashboardQueries({ ...base, ...overrides }),
  };
}

describe("HRMS dashboard (CM-319)", () => {
  it("counts the team's fortnight, today as of now", async () => {
    const { queries } = sources();
    const dashboard = await queries.dashboard(accessFor());

    expect(dashboard.today).toBe(TODAY);
    const team = dashboard.team;
    expect(team).not.toBeNull();
    expect(team?.breakdown).toEqual({
      present: 1,
      halfDay: 0,
      absent: 1,
      onLeave: 1,
      holiday: 0,
      weekOff: 0,
    });
    expect(team).toMatchObject({
      employees: 3,
      presentToday: 1,
      onLeave: 1,
      notCheckedIn: 1,
      late: 0,
    });

    const trend = new Map(team?.trend.map((day) => [day.date, day]));
    expect([...trend.keys()]).toEqual(TREND);
    // Sundays and Gandhi Jayanti: everyone off.
    expect(trend.get("2026-09-27")).toMatchObject({ weekOff: 3 });
    expect(trend.get("2026-10-04")).toMatchObject({ weekOff: 3 });
    expect(trend.get(GANDHI_JAYANTI)).toMatchObject({ holiday: 3 });
    // m2's half day.
    expect(trend.get("2026-10-06")).toEqual({
      date: "2026-10-06",
      present: 2,
      halfDay: 1,
      absent: 0,
      onLeave: 0,
      holiday: 0,
      weekOff: 0,
    });
    // m3 on leave, m2 absent.
    expect(trend.get("2026-10-08")).toMatchObject({
      present: 1,
      absent: 1,
      onLeave: 1,
    });
    // Today matches the breakdown.
    expect(trend.get(TODAY)).toEqual({ date: TODAY, ...team?.breakdown });
    // Every member counts once a day.
    for (const day of team?.trend ?? [])
      expect(
        day.present +
          day.halfDay +
          day.absent +
          day.onLeave +
          day.holiday +
          day.weekOff,
      ).toBe(3);
  });

  it("lists what the caller may decide, oldest first", async () => {
    const { queries } = sources();
    const { approvals } = await queries.dashboard(accessFor());
    expect(approvals).toMatchObject({
      total: 3,
      attendance: 1,
      leave: 1,
      cancellations: 1,
    });
    expect(
      approvals?.items.map((item) => [item.kind, item.id, item.title]),
    ).toEqual([
      ["cancellation", "r3", "Cancel Casual Leave"],
      ["attendance", "e1", "Back-dated day"],
      ["leave", "r1", "Casual Leave"],
    ]);
  });

  it("shows the next 14 days of team leave and the next holidays", async () => {
    const { queries, calls } = sources();
    const dashboard = await queries.dashboard(accessFor());
    expect(calls).toContain("team:2026-10-10..2026-10-23");
    expect(dashboard.teamLeaves?.items.map((item) => item.id)).toEqual([
      "r4",
      "r1",
    ]);
    expect(dashboard.holidays?.map((holiday) => holiday.name)).toEqual([
      "Diwali",
    ]);
  });

  it("gives the caller their own day, balances and pending requests", async () => {
    const { queries } = sources();
    const { me } = await queries.dashboard(accessFor());
    expect(me).toMatchObject({
      memberId: "m1",
      today: {
        state: "checked_in",
        shiftName: "General",
        firstCheckInAt: at(TODAY, "09:20"),
        lastCheckOutAt: null,
        late: true,
        openFromEarlierDay: false,
      },
      leaveYear: "2026",
      balances: [{ leaveTypeName: "Casual Leave", available: 8, pending: 2 }],
      pending: { attendance: 1, leave: 1 },
    });
    expect(me?.pending.items.map((item) => item.id)).toEqual([
      "e-mine",
      "r-mine",
    ]);
  });

  it("shows a member without View All only their own day", async () => {
    const { queries, calls } = sources();
    const dashboard = await queries.dashboard(
      accessFor(
        {
          "hrms.hrms": ["read"],
          "hrms.attendance": ["read", "create"],
          "hrms.leaves": ["read", "create"],
        },
        "company-1",
        "user-2",
      ),
    );
    expect(dashboard).toMatchObject({
      team: null,
      approvals: null,
      teamLeaves: null,
      holidays: null,
      permissions: {
        viewTeam: false,
        checkIn: true,
        applyLeave: true,
        approveAttendance: false,
        approveLeave: false,
        viewTeamLeaves: false,
        viewHolidays: false,
      },
    });
    expect(dashboard.me?.name).toBe("Prabhu Saravanan");
    expect(calls).not.toContain("teamToday");
    expect(calls.some((call) => call.startsWith("leaveApprovals"))).toBe(
      false,
    );
  });

  it("gives an approver without View All the approvals but not the team", async () => {
    const { queries } = sources({
      attendance: {
        teamToday: () => notExpected("teamToday"),
        today: () => notExpected("today"),
        approvals: () => Promise.resolve({ timeZone: IST, items: [] }),
      },
    });
    const dashboard = await queries.dashboard(
      accessFor(
        {
          "hrms.hrms": ["read"],
          "hrms.attendance": ["approve"],
        },
        "company-1",
        "user-3",
      ),
    );
    expect(dashboard.team).toBeNull();
    expect(dashboard.approvals).toEqual({
      total: 0,
      attendance: 0,
      leave: null,
      cancellations: null,
      items: [],
    });
    // Without attendance or leave read, the own day has neither.
    expect(dashboard.me).toMatchObject({
      today: null,
      balances: null,
      pending: { attendance: null, leave: null, items: [] },
    });
  });

  it("has no own section for a caller who is not a Team Member", async () => {
    const { queries } = sources();
    const { me } = await queries.dashboard(
      accessFor(undefined, "company-1", "user-9"),
    );
    expect(me).toBeNull();
  });

  it("needs HRMS read", async () => {
    const { queries } = sources();
    await expect(
      queries.dashboard(accessFor({ "hrms.attendance": ["read", "view_all"] })),
    ).rejects.toBeInstanceOf(DomainError);
  });
});
