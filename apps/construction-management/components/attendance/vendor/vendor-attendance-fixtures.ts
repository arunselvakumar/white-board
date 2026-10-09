import type {
  VendorAttendanceDay,
  VendorAttendanceGrid,
  VendorAttendanceGridRow,
  VendorAttendanceMonth,
  VendorAttendanceOvertime,
} from "@/src/queries/vendor-attendance";

/** Story data for vendor attendance (CM-213). */

export const PROJECT_ID = "019a0000-0000-7000-8000-000000000001";
export const DATE = "2026-10-08";
export const YESTERDAY = "2026-10-07";

export const MASON = "019a0000-0000-7000-8000-0000000000c1";
export const HELPER = "019a0000-0000-7000-8000-0000000000c2";
export const MUTHU = "019a0000-0000-7000-8000-0000000000a1";
export const ANBU = "019a0000-0000-7000-8000-0000000000a2";
export const SHIFT_1 = "019a0000-0000-7000-8000-0000000000b1";
export const NIGHT = "019a0000-0000-7000-8000-0000000000b2";

const AT = "2026-10-07T12:00:00.000Z";

export const MUTHU_ROW: VendorAttendanceGridRow = {
  vendorId: MUTHU,
  vendorName: "Muthu Gang",
  canRecord: true,
  onProject: true,
  isActive: true,
  hasRateCard: true,
  shifts: [
    {
      id: SHIFT_1,
      name: "Shift 1",
      startTime: "08:00",
      endTime: "17:00",
      rates: [
        {
          labourCategoryId: MASON,
          labourCategoryName: "Mason",
          ratePerDay: 90_000,
          overtimePerHour: 12_000,
        },
        {
          labourCategoryId: HELPER,
          labourCategoryName: "Helper",
          ratePerDay: 55_050,
          overtimePerHour: 7_000,
        },
      ],
    },
    {
      id: NIGHT,
      name: "Night",
      startTime: null,
      endTime: null,
      rates: [
        {
          labourCategoryId: MASON,
          labourCategoryName: "Mason",
          ratePerDay: 100_000,
          overtimePerHour: 15_000,
        },
      ],
    },
  ],
  attendance: null,
};

export const ANBU_NO_CARD: VendorAttendanceGridRow = {
  vendorId: ANBU,
  vendorName: "Anbu Gang",
  canRecord: false,
  onProject: true,
  isActive: true,
  hasRateCard: false,
  shifts: [],
  attendance: null,
};

export const MUTHU_YESTERDAY: VendorAttendanceDay = {
  id: "019a0000-0000-7000-8000-0000000000d1",
  projectId: PROJECT_ID,
  vendorId: MUTHU,
  vendorName: "Muthu Gang",
  date: YESTERDAY,
  totalPay: 280_000,
  fullDayCount: 3,
  halfDayCount: 0,
  overtimeHours: "0",
  lines: [
    {
      shiftId: SHIFT_1,
      shiftName: "Shift 1",
      labourCategoryId: MASON,
      labourCategoryName: "Mason",
      fullDayCount: 2,
      halfDayCount: 0,
      overtimeHours: "0",
      ratePerDay: 90_000,
      overtimePerHour: 12_000,
      amount: 180_000,
    },
    {
      shiftId: NIGHT,
      shiftName: "Night",
      labourCategoryId: MASON,
      labourCategoryName: "Mason",
      fullDayCount: 1,
      halfDayCount: 0,
      overtimeHours: "0",
      ratePerDay: 100_000,
      overtimePerHour: 15_000,
      amount: 100_000,
    },
  ],
  createdAt: AT,
  updatedAt: AT,
};

export function grid(
  date: string,
  vendors: VendorAttendanceGridRow[],
): VendorAttendanceGrid {
  return {
    projectId: PROJECT_ID,
    date,
    totalPay: vendors.reduce(
      (sum, row) => sum + (row.attendance?.totalPay ?? 0),
      0,
    ),
    vendors,
  };
}

/** What Save sends back for the day entered in the story. */
export const MUTHU_TODAY: VendorAttendanceDay = {
  ...MUTHU_YESTERDAY,
  id: "019a0000-0000-7000-8000-0000000000d2",
  date: DATE,
  totalPay: 435_600,
  fullDayCount: 5,
  halfDayCount: 1,
  overtimeHours: "1.5",
  lines: [
    {
      shiftId: SHIFT_1,
      shiftName: "Shift 1",
      labourCategoryId: MASON,
      labourCategoryName: "Mason",
      fullDayCount: 3,
      halfDayCount: 1,
      overtimeHours: "0",
      ratePerDay: 90_000,
      overtimePerHour: 12_000,
      amount: 315_000,
    },
    {
      shiftId: SHIFT_1,
      shiftName: "Shift 1",
      labourCategoryId: HELPER,
      labourCategoryName: "Helper",
      fullDayCount: 2,
      halfDayCount: 0,
      overtimeHours: "1.5",
      ratePerDay: 55_050,
      overtimePerHour: 7_000,
      amount: 120_600,
    },
  ],
  createdAt: "2026-10-08T06:00:00.000Z",
  updatedAt: "2026-10-08T06:00:00.000Z",
};

export const MONTH: VendorAttendanceMonth = {
  projectId: PROJECT_ID,
  month: "2026-10",
  from: "2026-10-01",
  to: "2026-10-31",
  dates: Array.from(
    { length: 31 },
    (_, index) => `2026-10-${String(index + 1).padStart(2, "0")}`,
  ),
  vendors: [
    {
      vendorId: MUTHU,
      vendorName: "Muthu Gang",
      days: [
        {
          date: "2026-10-01",
          attendanceId: "019a0000-0000-7000-8000-0000000000e1",
          fullDayCount: 5,
          halfDayCount: 1,
          overtimeHours: "1.5",
          pay: 435_600,
        },
        {
          date: "2026-10-02",
          attendanceId: "019a0000-0000-7000-8000-0000000000e2",
          fullDayCount: 3,
          halfDayCount: 0,
          overtimeHours: "0",
          pay: 280_000,
        },
      ],
      totals: {
        fullDayCount: 8,
        halfDayCount: 1,
        overtimeHours: "1.5",
        pay: 715_600,
      },
    },
  ],
  categories: [
    {
      labourCategoryId: HELPER,
      labourCategoryName: "Helper",
      fullDayCount: 2,
      halfDayCount: 0,
      overtimeHours: "1.5",
      pay: 120_600,
    },
    {
      labourCategoryId: MASON,
      labourCategoryName: "Mason",
      fullDayCount: 6,
      halfDayCount: 1,
      overtimeHours: "0",
      pay: 595_000,
    },
  ],
  dayTotals: [
    {
      date: "2026-10-01",
      fullDayCount: 5,
      halfDayCount: 1,
      overtimeHours: "1.5",
      pay: 435_600,
    },
    {
      date: "2026-10-02",
      fullDayCount: 3,
      halfDayCount: 0,
      overtimeHours: "0",
      pay: 280_000,
    },
  ],
  totals: {
    fullDayCount: 8,
    halfDayCount: 1,
    overtimeHours: "1.5",
    pay: 715_600,
  },
};

export const OVERTIME: VendorAttendanceOvertime = {
  projectId: PROJECT_ID,
  from: "2026-10-01",
  to: DATE,
  items: [
    {
      attendanceId: "019a0000-0000-7000-8000-0000000000e1",
      date: "2026-10-01",
      vendorId: MUTHU,
      vendorName: "Muthu Gang",
      shiftId: SHIFT_1,
      shiftName: "Shift 1",
      labourCategoryId: HELPER,
      labourCategoryName: "Helper",
      overtimeHours: "1.5",
      overtimePerHour: 7_000,
      overtimeAmount: 10_500,
    },
  ],
  totalHours: "1.5",
  totalAmount: 10_500,
};
