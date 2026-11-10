import type {
  LabourAttendanceDay,
  LabourAttendanceList,
  LabourAttendanceMonth,
  LabourSheet,
  LabourSheetRow,
} from "@/src/queries/labour-attendance";

/** Story data for labour attendance (CM-211, times CM-220). */

export const PROJECT_ID = "019a0000-0000-7000-8000-000000000001";
export const DATE = "2026-10-08";
export const AT = "2026-10-08T05:00:00.000Z";

export const MASON = "019a0000-0000-7000-8000-0000000000c1";
export const SUNDAR = "019a0000-0000-7000-8000-0000000000d1";
export const DHURESH = "019a0000-0000-7000-8000-0000000000e1";
export const KAVITHA = "019a0000-0000-7000-8000-0000000000e2";
export const MURUGAN = "019a0000-0000-7000-8000-0000000000e3";
export const ANBU = "019a0000-0000-7000-8000-0000000000e4";

function day(
  labourId: string,
  labourName: string,
  overrides: Partial<LabourAttendanceDay> = {},
): LabourAttendanceDay {
  return {
    id: `019a0000-0000-7000-8000-0000000001${labourId.slice(-2)}`,
    projectId: PROJECT_ID,
    labourId,
    labourName,
    labourCode: null,
    date: DATE,
    status: "present",
    isPaidLeave: false,
    shift: "General",
    supervisor: { id: SUNDAR, name: "Sundar" },
    checkIn: null,
    checkOut: null,
    breakMinutes: null,
    workingHours: "8",
    workedHours: null,
    wageType: "daily",
    wageRate: 70_000,
    earned: 70_000,
    overtime: [],
    overtimeHours: "0",
    overtimeAmount: 0,
    total: 70_000,
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

function row(
  labourId: string,
  name: string,
  overrides: Partial<LabourSheetRow> = {},
): LabourSheetRow {
  return {
    labourId,
    name,
    labourCode: null,
    labourCategory: { id: MASON, name: "Mason" },
    supervisor: { id: SUNDAR, name: "Sundar" },
    weeklyHolidays: [0],
    wageType: "daily",
    wagePerDay: 70_000,
    wagePerMonth: null,
    overtimeWagePerHour: 10_000,
    workingHoursPerDay: "8",
    canMark: true,
    isActive: true,
    onProject: true,
    isWeeklyHoliday: false,
    suggestedStatus: null,
    yesterday: null,
    attendance: null,
    ...overrides,
  };
}

export const DHURESH_SAVED = day(DHURESH, "Dhuresh Nawin");

/** 08:00–19:00 with the hour's break: 10 h worked, 2 h from the times. */
export const ANBU_SAVED = day(ANBU, "Anbu Selvan", {
  shift: null,
  checkIn: "08:00",
  checkOut: "19:00",
  breakMinutes: 60,
  workedHours: "10",
  overtime: [
    {
      labourCategoryId: MASON,
      labourCategoryName: "Mason",
      hours: "2",
      ratePerHour: 10_000,
      amount: 20_000,
      fromTimes: true,
    },
  ],
  overtimeHours: "2",
  overtimeAmount: 20_000,
  total: 90_000,
});

export const SHEET: LabourSheet = {
  projectId: PROJECT_ID,
  date: DATE,
  labourers: [
    row(ANBU, "Anbu Selvan", { attendance: ANBU_SAVED }),
    row(MURUGAN, "Murugan Ganesan", {
      weeklyHolidays: [4],
      isWeeklyHoliday: true,
      suggestedStatus: "holiday",
      supervisor: null,
    }),
    row(DHURESH, "Dhuresh Nawin", {
      labourCode: "L-07",
      attendance: DHURESH_SAVED,
      yesterday: {
        status: "present",
        isPaidLeave: false,
        shift: "General",
        checkIn: "09:00",
        checkOut: "18:00",
        breakMinutes: 60,
      },
    }),
    row(KAVITHA, "Kavitha Murugan", {
      wageType: "monthly",
      wagePerDay: null,
      wagePerMonth: 3_100_000,
      overtimeWagePerHour: 15_000,
      suggestedStatus: "half_day",
      yesterday: {
        status: "half_day",
        isPaidLeave: false,
        shift: "Shift 1",
        checkIn: "09:00",
        checkOut: "13:30",
        breakMinutes: 0,
      },
    }),
  ],
  labourCategories: [{ id: MASON, name: "Mason" }],
  supervisors: [{ id: SUNDAR, name: "Sundar" }],
  totals: {
    marked: 2,
    present: 2,
    halfDay: 0,
    absent: 0,
    onLeave: 0,
    holiday: 0,
    earned: 140_000,
    overtimeAmount: 20_000,
  },
};

export const EMPTY_SHEET: LabourSheet = {
  ...SHEET,
  labourers: [],
  supervisors: [],
  totals: {
    ...SHEET.totals,
    marked: 0,
    present: 0,
    earned: 0,
    overtimeAmount: 0,
  },
};

/**
 * Recorded days: one with times and overtime from them, a night shift that
 * ends the next day, a short Half Day, and days without times.
 */
export const RECORDED: LabourAttendanceList = {
  items: [
    ANBU_SAVED,
    day(KAVITHA, "Kavitha Murugan", {
      id: "019a0000-0000-7000-8000-0000000003e2",
      status: "half_day",
      shift: "Shift 1",
      checkIn: "09:00",
      checkOut: "13:30",
      breakMinutes: 0,
      workedHours: "4.5",
      wageType: "monthly",
      wageRate: 3_100_000,
      earned: 50_000,
      total: 50_000,
    }),
    day(MURUGAN, "Murugan Ganesan", {
      id: "019a0000-0000-7000-8000-0000000003e3",
      shift: "Shift 3",
      checkIn: "21:00",
      checkOut: "06:00",
      breakMinutes: 30,
      workedHours: "8.5",
      supervisor: null,
    }),
    DHURESH_SAVED,
    day(DHURESH, "Dhuresh Nawin", {
      id: "019a0000-0000-7000-8000-0000000003e1",
      date: "2026-10-07",
      status: "absent",
      shift: null,
      earned: 0,
      total: 0,
    }),
  ],
  nextCursor: null,
  prevCursor: null,
  total: 5,
};

const zero = {
  present: 0,
  halfDay: 0,
  absent: 0,
  leave: 0,
  paidLeave: 0,
  holiday: 0,
  overtimeHours: "0",
  earned: 0,
  overtimeAmount: 0,
  total: 0,
};

export const MONTH: LabourAttendanceMonth = {
  projectId: PROJECT_ID,
  month: "2026-10",
  from: "2026-10-01",
  to: "2026-10-31",
  dates: Array.from(
    { length: 31 },
    (_, index) => `2026-10-${String(index + 1).padStart(2, "0")}`,
  ),
  labourers: [
    {
      labourId: DHURESH,
      name: "Dhuresh Nawin",
      labourCode: "L-07",
      days: [
        {
          date: "2026-10-01",
          attendanceId: "019a0000-0000-7000-8000-000000000201",
          code: "P",
          status: "present",
          isPaidLeave: false,
          overtimeHours: "2",
          earned: 70_000,
          overtimeAmount: 20_000,
        },
        {
          date: "2026-10-02",
          attendanceId: "019a0000-0000-7000-8000-000000000202",
          code: "PL",
          status: "on_leave",
          isPaidLeave: true,
          overtimeHours: "0",
          earned: 70_000,
          overtimeAmount: 0,
        },
      ],
      totals: {
        ...zero,
        present: 1,
        paidLeave: 1,
        overtimeHours: "2",
        earned: 140_000,
        overtimeAmount: 20_000,
        total: 160_000,
      },
    },
    {
      labourId: KAVITHA,
      name: "Kavitha Murugan",
      labourCode: null,
      days: [
        {
          date: "2026-10-01",
          attendanceId: "019a0000-0000-7000-8000-000000000203",
          code: "H",
          status: "half_day",
          isPaidLeave: false,
          overtimeHours: "0",
          earned: 50_000,
          overtimeAmount: 0,
        },
      ],
      totals: { ...zero, halfDay: 1, earned: 50_000, total: 50_000 },
    },
  ],
  dayCounts: [
    { date: "2026-10-01", present: 1, halfDay: 1, marked: 2 },
    { date: "2026-10-02", present: 0, halfDay: 0, marked: 1 },
  ],
  totals: {
    ...zero,
    present: 1,
    halfDay: 1,
    paidLeave: 1,
    overtimeHours: "2",
    earned: 190_000,
    overtimeAmount: 20_000,
    total: 210_000,
  },
};
