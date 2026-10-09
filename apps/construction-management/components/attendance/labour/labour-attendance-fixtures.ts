import type {
  LabourAttendanceDay,
  LabourAttendanceMonth,
  LabourSheet,
  LabourSheetRow,
} from "@/src/queries/labour-attendance";

/** Story data for labour attendance (CM-211). */

export const PROJECT_ID = "019a0000-0000-7000-8000-000000000001";
export const DATE = "2026-10-08";
export const AT = "2026-10-08T05:00:00.000Z";

export const MASON = "019a0000-0000-7000-8000-0000000000c1";
export const SUNIL = "019a0000-0000-7000-8000-0000000000d1";
export const RAJU = "019a0000-0000-7000-8000-0000000000e1";
export const SITA = "019a0000-0000-7000-8000-0000000000e2";
export const MOHAN = "019a0000-0000-7000-8000-0000000000e3";
export const ANIL = "019a0000-0000-7000-8000-0000000000e4";

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
    supervisor: { id: SUNIL, name: "Sunil" },
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
    supervisor: { id: SUNIL, name: "Sunil" },
    weeklyHolidays: [0],
    wageType: "daily",
    wagePerDay: 70_000,
    wagePerMonth: null,
    overtimeWagePerHour: 10_000,
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

export const RAJU_SAVED = day(RAJU, "Raju Pawar");
export const ANIL_SAVED = day(ANIL, "Anil Jadhav", { shift: null });

export const SHEET: LabourSheet = {
  projectId: PROJECT_ID,
  date: DATE,
  labourers: [
    row(ANIL, "Anil Jadhav", { attendance: ANIL_SAVED }),
    row(MOHAN, "Mohan Patil", {
      weeklyHolidays: [4],
      isWeeklyHoliday: true,
      suggestedStatus: "holiday",
      supervisor: null,
    }),
    row(RAJU, "Raju Pawar", {
      labourCode: "L-07",
      attendance: RAJU_SAVED,
      yesterday: { status: "present", isPaidLeave: false, shift: "General" },
    }),
    row(SITA, "Sita Kale", {
      wageType: "monthly",
      wagePerDay: null,
      wagePerMonth: 3_100_000,
      overtimeWagePerHour: 15_000,
      suggestedStatus: "half_day",
      yesterday: { status: "half_day", isPaidLeave: false, shift: "Shift 1" },
    }),
  ],
  labourCategories: [{ id: MASON, name: "Mason" }],
  supervisors: [{ id: SUNIL, name: "Sunil" }],
  totals: {
    marked: 2,
    present: 2,
    halfDay: 0,
    absent: 0,
    onLeave: 0,
    holiday: 0,
    earned: 140_000,
    overtimeAmount: 0,
  },
};

export const EMPTY_SHEET: LabourSheet = {
  ...SHEET,
  labourers: [],
  supervisors: [],
  totals: { ...SHEET.totals, marked: 0, present: 0, earned: 0 },
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
      labourId: RAJU,
      name: "Raju Pawar",
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
      labourId: SITA,
      name: "Sita Kale",
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
