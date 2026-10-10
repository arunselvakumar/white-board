import type {
  HrmsAttendanceApprovals,
  HrmsAttendanceDay,
  HrmsAttendanceEntry,
  HrmsAttendanceMonth,
  HrmsAttendanceToday,
  HrmsTeamToday,
} from "@/src/queries/hrms-attendance";

/** Story data for the attendance screens (CM-309). */

export const TODAY = "2026-10-10";
export const ZONE = "Asia/Kolkata";

const MEMBER = {
  memberId: "0199d0a0-0000-7000-8000-000000000001",
  name: "Prabhu Saravanan",
  designationName: "Site Engineer",
  memberType: "normal" as const,
};

let serial = 0;

export function entry(
  overrides: Partial<HrmsAttendanceEntry> = {},
): HrmsAttendanceEntry {
  serial += 1;
  return {
    id: `0199d0a0-0000-7000-8000-${String(serial).padStart(12, "0")}`,
    memberId: MEMBER.memberId,
    date: TODAY,
    // 09:05 IST.
    checkInAt: "2026-10-10T03:35:00.000Z",
    checkOutAt: null,
    hours: null,
    source: "check_in",
    approvalStatus: "none",
    outOfFence: false,
    checkInLocation: null,
    checkInBranchId: null,
    checkOutLocation: null,
    checkOutBranchId: null,
    reason: null,
    rejectionReason: null,
    decidedAt: null,
    createdAt: "2026-10-10T03:35:00.000Z",
    updatedAt: "2026-10-10T03:35:00.000Z",
    ...overrides,
  };
}

export function day(
  date: string,
  overrides: Partial<HrmsAttendanceDay> = {},
): HrmsAttendanceDay {
  return {
    date,
    status: "absent",
    workedHours: 0,
    overtimeHours: 0,
    overtimeAllowed: false,
    late: false,
    leave: null,
    ...overrides,
  };
}

export function today(
  overrides: Partial<HrmsAttendanceToday> = {},
): HrmsAttendanceToday {
  return {
    today: TODAY,
    timeZone: ZONE,
    member: MEMBER,
    gpsRequirement: "disabled",
    fenceCount: 1,
    shift: {
      name: "General",
      startTime: "09:00",
      endTime: "18:00",
      workingHours: 8,
      isWorkingDay: true,
    },
    holidayName: null,
    day: day(TODAY),
    state: "not_checked_in",
    entries: [],
    openEntry: null,
    openNow: false,
    pending: [],
    canCreate: true,
    ...overrides,
  };
}

/** Checked in two hours ago. */
export function checkedIn(
  overrides: Partial<HrmsAttendanceToday> = {},
): HrmsAttendanceToday {
  const open = entry({
    checkInAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
  });
  return today({
    state: "checked_in",
    entries: [open],
    openEntry: open,
    openNow: true,
    ...overrides,
  });
}

const PEOPLE = [
  ["Prabhu Saravanan", "Site Engineer"],
  ["Meena Rajan", "Accountant"],
  ["Karthik Ravi", "Store Keeper"],
  ["Divya Lakshmi", "Office Assistant"],
  ["Arun Selva Kumar", null],
] as const;

export function member(index: number) {
  const [name, designationName] = PEOPLE[index] ?? ["Someone", null];
  return {
    memberId: `0199d0a0-0000-7000-8000-${String(100 + index).padStart(12, "0")}`,
    name,
    designationName,
    memberType: "normal" as const,
  };
}

export const TEAM_TODAY: HrmsTeamToday = {
  today: TODAY,
  timeZone: ZONE,
  counts: {
    all: 5,
    late: 1,
    checked_in: 2,
    checked_out: 1,
    not_checked_in: 1,
    on_leave: 1,
    holiday: 0,
    week_off: 0,
  },
  items: [
    {
      member: member(0),
      state: "checked_in",
      late: false,
      firstCheckInAt: "2026-10-10T03:32:00.000Z",
      lastCheckOutAt: null,
      workedHours: 0,
      openFromEarlierDay: false,
      outOfFence: false,
    },
    {
      member: member(1),
      state: "checked_in",
      late: true,
      firstCheckInAt: "2026-10-10T04:10:00.000Z",
      lastCheckOutAt: null,
      workedHours: 0,
      openFromEarlierDay: false,
      outOfFence: true,
    },
    {
      member: member(2),
      state: "checked_out",
      late: false,
      firstCheckInAt: "2026-10-10T02:30:00.000Z",
      lastCheckOutAt: "2026-10-10T07:00:00.000Z",
      workedHours: 4.5,
      openFromEarlierDay: false,
      outOfFence: false,
    },
    {
      member: member(3),
      state: "not_checked_in",
      late: false,
      firstCheckInAt: null,
      lastCheckOutAt: null,
      workedHours: 0,
      openFromEarlierDay: true,
      outOfFence: false,
    },
    {
      member: member(4),
      state: "on_leave",
      late: false,
      firstCheckInAt: null,
      lastCheckOutAt: null,
      workedHours: 0,
      openFromEarlierDay: false,
      outOfFence: false,
    },
  ],
};

export const APPROVALS: HrmsAttendanceApprovals = {
  timeZone: ZONE,
  items: [
    {
      member: member(0),
      entry: entry({
        date: "2026-10-08",
        checkInAt: "2026-10-08T03:30:00.000Z",
        checkOutAt: "2026-10-08T12:30:00.000Z",
        hours: 9,
        source: "manual",
        approvalStatus: "pending",
        reason: "At the client's office all day",
      }),
    },
    {
      member: member(1),
      entry: entry({
        date: "2026-10-09",
        checkInAt: "2026-10-09T03:30:00.000Z",
        checkOutAt: "2026-10-09T13:00:00.000Z",
        hours: 9.5,
        source: "missed_checkout",
        approvalStatus: "pending",
        reason: "Phone died at the site",
      }),
    },
    {
      member: member(2),
      entry: entry({
        checkInAt: "2026-10-10T03:40:00.000Z",
        approvalStatus: "pending",
        outOfFence: true,
        checkInLocation: {
          latitude: 13.0927,
          longitude: 80.2707,
          accuracyMetres: 12,
        },
      }),
    },
  ],
};

function monthDays(
  statuses: HrmsAttendanceDay["status"][],
): HrmsAttendanceDay[] {
  return Array.from({ length: 31 }, (_, index) => {
    const date = `2026-10-${String(index + 1).padStart(2, "0")}`;
    const status = statuses[index % statuses.length] ?? "present";
    return day(date, {
      status,
      workedHours: status === "present" ? 8.5 : status === "half_day" ? 4.5 : 0,
      late: index === 5,
      leave:
        status === "on_leave"
          ? {
              paid: true,
              half: index === 7,
              otherHalf: index === 7 ? "present" : null,
            }
          : null,
    });
  });
}

export const OCTOBER: HrmsAttendanceMonth = {
  month: "2026-10",
  today: TODAY,
  rows: [
    {
      member: member(0),
      days: monthDays([
        "holiday",
        "present",
        "week_off",
        "week_off",
        "present",
        "present",
        "half_day",
        "on_leave",
        "absent",
        "present",
      ]),
      counts: {
        workingDays: 7,
        present: 4.5,
        halfDays: 1,
        absent: 1,
        paidLeave: 0.5,
        unpaidLeave: 0,
        weekOff: 2,
        holidays: 1,
        late: 1,
        workedHours: 38.5,
        overtimeHours: 2,
      },
    },
    {
      member: member(1),
      days: monthDays(["present", "present", "week_off", "absent"]),
      counts: {
        workingDays: 8,
        present: 6,
        halfDays: 0,
        absent: 2,
        paidLeave: 0,
        unpaidLeave: 0,
        weekOff: 2,
        holidays: 0,
        late: 1,
        workedHours: 51,
        overtimeHours: 0,
      },
    },
  ],
};
