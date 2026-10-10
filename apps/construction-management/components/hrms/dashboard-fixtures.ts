import type { HrmsDashboardModel } from "@/src/queries/hrms-dashboard";

/** Story data for the HRMS Dashboard and the Workspace tile (CM-319). */

export const DASHBOARD_TODAY = "2026-10-10";
const ZONE = "Asia/Kolkata";

const id = (serial: number) =>
  `0199d0a0-0000-7000-8000-${String(serial).padStart(12, "0")}`;

function date(offset: number): string {
  const day = new Date(`${DASHBOARD_TODAY}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + offset);
  return day.toISOString().slice(0, 10);
}

const ZERO = {
  present: 0,
  halfDay: 0,
  absent: 0,
  onLeave: 0,
  holiday: 0,
  weekOff: 0,
};

/** Twelve Team Members over the last fortnight; Sundays off, 2 Oct a holiday. */
function trend(): NonNullable<HrmsDashboardModel["team"]>["trend"] {
  return Array.from({ length: 14 }, (_, index) => {
    const day = date(index - 13);
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    if (weekday === 0) return { ...ZERO, date: day, weekOff: 12 };
    if (day === "2026-10-02") return { ...ZERO, date: day, holiday: 12 };
    if (day === DASHBOARD_TODAY)
      return { ...ZERO, date: day, present: 8, absent: 3, onLeave: 1 };
    const onLeave = index % 4 === 0 ? 2 : 1;
    const halfDay = index % 3 === 0 ? 1 : 0;
    const absent = index % 5 === 0 ? 2 : 1;
    return {
      ...ZERO,
      date: day,
      present: 12 - onLeave - halfDay - absent,
      halfDay,
      absent,
      onLeave,
    };
  });
}

const PERMISSIONS: HrmsDashboardModel["permissions"] = {
  viewTeam: true,
  checkIn: true,
  applyLeave: true,
  approveAttendance: true,
  approveLeave: true,
  viewTeamLeaves: true,
  viewHolidays: true,
};

type MyToday = NonNullable<NonNullable<HrmsDashboardModel["me"]>["today"]>;

const ME_TODAY: MyToday = {
  state: "checked_in",
  status: "absent",
  shiftName: "General",
  holidayName: null,
  // 09:05 IST.
  firstCheckInAt: "2026-10-10T03:35:00.000Z",
  lastCheckOutAt: null,
  workedHours: 0,
  late: false,
  openFromEarlierDay: false,
};

const ME: NonNullable<HrmsDashboardModel["me"]> = {
  memberId: id(1),
  name: "Arun Selva Kumar",
  today: ME_TODAY,
  leaveYear: "2026",
  balances: [
    {
      leaveTypeId: id(41),
      leaveTypeName: "Casual Leave",
      isPaid: true,
      entitlement: 12,
      available: 9,
      pending: 0,
    },
    {
      leaveTypeId: id(42),
      leaveTypeName: "Sick Leave",
      isPaid: true,
      entitlement: 7,
      available: 5.22,
      pending: 0,
    },
    {
      leaveTypeId: id(43),
      leaveTypeName: "Privilege Leave",
      isPaid: true,
      entitlement: 15,
      available: 11.25,
      pending: 0,
    },
  ],
  pending: { attendance: 0, leave: 0, items: [] },
};

/** The Owner's dashboard: the team's day, approvals, leave and holidays. */
export const OWNER_DASHBOARD: HrmsDashboardModel = {
  today: DASHBOARD_TODAY,
  timeZone: ZONE,
  permissions: PERMISSIONS,
  team: {
    employees: 12,
    presentToday: 8,
    onLeave: 1,
    notCheckedIn: 3,
    late: 2,
    breakdown: { ...ZERO, present: 8, absent: 3, onLeave: 1 },
    trend: trend(),
  },
  approvals: {
    total: 4,
    attendance: 2,
    leave: 1,
    cancellations: 1,
    items: [
      {
        kind: "attendance",
        id: id(11),
        memberName: "Divya Lakshmi",
        title: "Missed checkout",
        fromDate: date(-2),
        toDate: date(-2),
        days: null,
        requestedAt: "2026-10-09T04:00:00.000Z",
      },
      {
        kind: "cancellation",
        id: id(12),
        memberName: "Meena Rajan",
        title: "Cancel Casual Leave",
        fromDate: date(6),
        toDate: date(6),
        days: 1,
        requestedAt: "2026-10-09T06:00:00.000Z",
      },
      {
        kind: "leave",
        id: id(13),
        memberName: "Prabhu Saravanan",
        title: "Casual Leave",
        fromDate: date(4),
        toDate: date(5),
        days: 2,
        requestedAt: "2026-10-09T08:30:00.000Z",
      },
      {
        kind: "attendance",
        id: id(14),
        memberName: "Karthik Raja",
        title: "Back-dated day",
        fromDate: date(-1),
        toDate: date(-1),
        days: null,
        requestedAt: "2026-10-10T02:30:00.000Z",
      },
    ],
  },
  teamLeaves: {
    total: 3,
    items: [
      {
        id: id(21),
        memberName: "Saranya Devi",
        leaveTypeName: "Sick Leave",
        fromDate: DASHBOARD_TODAY,
        toDate: DASHBOARD_TODAY,
        totalDays: 1,
        status: "approved",
      },
      {
        id: id(13),
        memberName: "Prabhu Saravanan",
        leaveTypeName: "Casual Leave",
        fromDate: date(4),
        toDate: date(5),
        totalDays: 2,
        status: "pending",
      },
      {
        id: id(12),
        memberName: "Meena Rajan",
        leaveTypeName: "Casual Leave",
        fromDate: date(6),
        toDate: date(6),
        totalDays: 1,
        status: "cancellation_requested",
      },
    ],
  },
  holidays: [
    {
      id: id(31),
      name: "Diwali",
      date: "2026-11-08",
      type: "festival",
      isOptional: false,
    },
    {
      id: id(32),
      name: "Guru Nanak Jayanti",
      date: "2026-11-24",
      type: "festival",
      isOptional: true,
    },
  ],
  me: ME,
};

/** A Team Member without View All: only their own day. */
export const MEMBER_DASHBOARD: HrmsDashboardModel = {
  today: DASHBOARD_TODAY,
  timeZone: ZONE,
  permissions: {
    ...PERMISSIONS,
    viewTeam: false,
    approveAttendance: false,
    approveLeave: false,
    viewTeamLeaves: false,
  },
  team: null,
  approvals: null,
  teamLeaves: null,
  holidays: OWNER_DASHBOARD.holidays,
  me: {
    ...ME,
    memberId: id(2),
    name: "Prabhu Saravanan",
    today: {
      ...ME_TODAY,
      state: "not_checked_in",
      firstCheckInAt: null,
    },
    pending: {
      attendance: 1,
      leave: 1,
      items: [
        {
          kind: "attendance",
          id: id(15),
          memberName: "Prabhu Saravanan",
          title: "Back-dated day",
          fromDate: date(-3),
          toDate: date(-3),
          days: null,
          requestedAt: "2026-10-08T05:00:00.000Z",
        },
        {
          kind: "leave",
          id: id(13),
          memberName: "Prabhu Saravanan",
          title: "Casual Leave",
          fromDate: date(4),
          toDate: date(5),
          days: 2,
          requestedAt: "2026-10-09T08:30:00.000Z",
        },
      ],
    },
  },
};

/** A new Company: only the Owner, nothing pending, no holidays. */
export const EMPTY_DASHBOARD: HrmsDashboardModel = {
  ...OWNER_DASHBOARD,
  team: {
    employees: 1,
    presentToday: 0,
    onLeave: 0,
    notCheckedIn: 1,
    late: 0,
    breakdown: { ...ZERO, absent: 1 },
    trend: trend().map((day) => ({ ...ZERO, date: day.date, absent: 1 })),
  },
  approvals: {
    total: 0,
    attendance: 0,
    leave: 0,
    cancellations: 0,
    items: [],
  },
  teamLeaves: { total: 0, items: [] },
  holidays: [],
  me: {
    ...ME,
    today: { ...ME_TODAY, state: "not_checked_in", firstCheckInAt: null },
    balances: [],
  },
};
