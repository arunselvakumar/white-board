import { z } from "zod";

import type {
  LabourAttendanceDayReadModel,
  LabourMonthReadModel,
  LabourMonthTotals,
  LabourSheetReadModel,
} from "@/src/labour/application/labour-attendance-handlers";

export const LABOUR_ATTENDANCE_PATH =
  "/api/construction/labour/attendance/labour";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const STATUSES = [
  "present",
  "half_day",
  "absent",
  "on_leave",
  "holiday",
] as const;

const status = z.enum(STATUSES);

const timeOfDay = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM, 00:00 to 23:59.");

// Requests

export const GetConstructionLabourEmployeeAttendanceSheetRequestModel =
  z.object({
    projectId: z.uuid(),
    /** `YYYY-MM-DD`. */
    date: z.iso.date(),
  });

export const MarkConstructionLabourEmployeeAttendanceRequestModel = z.object({
  projectId: z.uuid(),
  /** `YYYY-MM-DD`, not in the future. */
  date: z.iso.date(),
  /** One per Employee; send only the rows that changed. */
  marks: z
    .array(
      z.object({
        employeeId: z.uuid(),
        status,
        /** Only on `on_leave`. */
        isPaidLeave: z.boolean().optional(),
        /** Free label: General, Shift 1, Shift 2, Shift 3. */
        shift: z.string().max(40).nullable().optional(),
        /** `HH:MM` (24-hour, Company time); only on `present` or `half_day`. */
        checkIn: timeOfDay.nullable().optional(),
        /** `HH:MM`; needs `checkIn`. At or before `checkIn` is the next day. */
        checkOut: timeOfDay.nullable().optional(),
        /** Unpaid break in minutes, 0–720; 60 when left out with a check-in. */
        breakMinutes: z.int().min(0).max(720).nullable().optional(),
        overtime: z
          .array(
            z.object({
              labourCategoryId: z.uuid().nullable(),
              /**
               * Decimal hours, 0 < h ≤ 24, two places at most. Required
               * unless `fromTimes`.
               */
              hours: z
                .union([z.string().max(12), z.number()])
                .nullable()
                .optional(),
              /** Paise per hour; leave out for the Employee's overtime wage. */
              ratePerHour: z.int().nullable().optional(),
              /**
               * The server works the hours out from check-in, check-out,
               * break and the Employee's working hours (ADR CM-0011); the line
               * is dropped while there is no check-out or no extra time. At
               * most one per day.
               */
              fromTimes: z.boolean().optional(),
            }),
          )
          .max(10)
          .optional(),
      }),
    )
    .min(1)
    .max(500),
  /**
   * `updatedAt` of every already-marked row being changed, by Employee id.
   * A marked row without its entry, or with a stale one, is 409
   * `ATTENDANCE_CHANGED` with `details.employeeId`.
   */
  expected: z.record(z.string(), z.iso.datetime()).optional(),
});

export type MarkConstructionLabourEmployeeAttendanceRequestModel = z.infer<
  typeof MarkConstructionLabourEmployeeAttendanceRequestModel
>;

export const ClearConstructionLabourEmployeeAttendanceRequestModel = z.object({
  projectId: z.uuid(),
  date: z.iso.date(),
  employeeIds: z.array(z.uuid()).min(1).max(500),
  /** `updatedAt` of each row as last seen, by Employee id. */
  expected: z.record(z.string(), z.iso.datetime()),
});

export type ClearConstructionLabourEmployeeAttendanceRequestModel = z.infer<
  typeof ClearConstructionLabourEmployeeAttendanceRequestModel
>;

export const ConstructionLabourEmployeeAttendanceParamsModel = z.object({
  id: z.uuid(),
});

export const SetConstructionLabourEmployeeAttendancePaidLeaveRequestModel =
  z.object({
    isPaidLeave: z.boolean(),
    expectedUpdatedAt: z.iso.datetime(),
  });

export type SetConstructionLabourEmployeeAttendancePaidLeaveRequestModel =
  z.infer<typeof SetConstructionLabourEmployeeAttendancePaidLeaveRequestModel>;

export const ListConstructionLabourEmployeeAttendanceRequestModel = z
  .object({
    projectId: z.uuid(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    employeeId: z.uuid().optional(),
    /** `on_leave` is every leave day; `paid_leave` only the paid ones. */
    status: z.enum([...STATUSES, "paid_leave"]).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional().default(50),
    after: z.string().min(1).optional(),
    before: z.string().min(1).optional(),
  })
  .refine((value) => value.after == null || value.before == null, {
    message: "after and before are mutually exclusive.",
    path: ["after"],
  });

export const GetConstructionLabourEmployeeAttendanceMonthRequestModel =
  z.object({
    projectId: z.uuid(),
    /** `YYYY-MM`. */
    month: z.string().regex(MONTH_RE, "Use YYYY-MM."),
  });

// Responses (amounts are paise; null without `labour.labour` Financial)

const money = z.int().nullable();
const ref = z.object({ id: z.uuid(), name: z.string() });

export const ConstructionLabourEmployeeAttendanceOvertimeResponseModel =
  z.object({
    labourCategoryId: z.uuid().nullable(),
    labourCategoryName: z.string().nullable(),
    /** Decimal hours. */
    hours: z.string(),
    ratePerHour: money,
    amount: money,
    /** Hours worked out from the day's times (ADR CM-0011). */
    fromTimes: z.boolean(),
  });

export const ConstructionLabourEmployeeAttendanceDayResponseModel = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  employeeId: z.uuid(),
  employeeName: z.string(),
  employeeCode: z.string().nullable(),
  date: z.iso.date(),
  status,
  isPaidLeave: z.boolean(),
  shift: z.string().nullable(),
  /** `HH:MM`, or null. */
  checkIn: z.string().nullable(),
  /** `HH:MM`, or null; at or before `checkIn` is the next day. */
  checkOut: z.string().nullable(),
  /** Unpaid break in minutes; null without a check-in. */
  breakMinutes: z.int().nullable(),
  /**
   * The times follow the Check-In log ("From Check-In"); sending other
   * times on the sheet turns it off (ADR CM-0043).
   */
  timesFromCheckIn: z.boolean(),
  /** Snapshot of the Employee's working hours a day (decimal hours). */
  workingHours: z.string(),
  /** check-out − check-in − break, decimal hours; null without both times. */
  workedHours: z.string().nullable(),
  wageType: z.enum(["daily", "monthly"]),
  /** Snapshot wage per day or per month. */
  wageRate: money,
  /** What the day pays before overtime. */
  earned: money,
  overtime: z.array(ConstructionLabourEmployeeAttendanceOvertimeResponseModel),
  overtimeHours: z.string(),
  overtimeAmount: money,
  total: money,
  createdAt: z.iso.datetime(),
  /** Send back in `expected` to change or clear the day. */
  updatedAt: z.iso.datetime(),
});

export type ConstructionLabourEmployeeAttendanceDayResponseModel = z.infer<
  typeof ConstructionLabourEmployeeAttendanceDayResponseModel
>;

export const MarkConstructionLabourEmployeeAttendanceResponseModel = z.object({
  items: z.array(ConstructionLabourEmployeeAttendanceDayResponseModel),
});

export type MarkConstructionLabourEmployeeAttendanceResponseModel = z.infer<
  typeof MarkConstructionLabourEmployeeAttendanceResponseModel
>;

export const GetConstructionLabourEmployeeAttendanceSheetResponseModel =
  z.object({
    projectId: z.uuid(),
    date: z.iso.date(),
    employees: z.array(
      z.object({
        employeeId: z.uuid(),
        name: z.string(),
        employeeCode: z.string().nullable(),
        labourCategory: ref.nullable(),
        /** The Employee's Role (ADR CM-0055); null once it was deleted. */
        role: ref.nullable(),
        /** 0 = Sunday … 6 = Saturday. */
        weeklyHolidays: z.array(z.int()),
        wageType: z.enum(["daily", "monthly"]).nullable(),
        wagePerDay: money,
        wagePerMonth: money,
        /** The default rate of a new overtime line. */
        overtimeWagePerHour: money,
        /** Decimal hours a day; time worked beyond it is overtime. */
        workingHoursPerDay: z.string().nullable(),
        /** Active and on this Project on the date. */
        canMark: z.boolean(),
        isActive: z.boolean(),
        onProject: z.boolean(),
        isWeeklyHoliday: z.boolean(),
        /** Holiday on a weekly holiday, otherwise yesterday's status. */
        suggestedStatus: status.nullable(),
        yesterday: z
          .object({
            status,
            isPaidLeave: z.boolean(),
            shift: z.string().nullable(),
            checkIn: z.string().nullable(),
            checkOut: z.string().nullable(),
            breakMinutes: z.int().nullable(),
          })
          .nullable(),
        attendance:
          ConstructionLabourEmployeeAttendanceDayResponseModel.nullable(),
      }),
    ),
    labourCategories: z.array(ref),
    totals: z.object({
      marked: z.int(),
      present: z.int(),
      halfDay: z.int(),
      absent: z.int(),
      onLeave: z.int(),
      holiday: z.int(),
      earned: money,
      overtimeAmount: money,
    }),
  });

export type GetConstructionLabourEmployeeAttendanceSheetResponseModel = z.infer<
  typeof GetConstructionLabourEmployeeAttendanceSheetResponseModel
>;

export const ListConstructionLabourEmployeeAttendanceResponseModel = z.object({
  items: z.array(ConstructionLabourEmployeeAttendanceDayResponseModel),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.int().nonnegative(),
});

export type ListConstructionLabourEmployeeAttendanceResponseModel = z.infer<
  typeof ListConstructionLabourEmployeeAttendanceResponseModel
>;

const totalsModel = z.object({
  present: z.int(),
  halfDay: z.int(),
  absent: z.int(),
  /** Unpaid leave. */
  leave: z.int(),
  paidLeave: z.int(),
  holiday: z.int(),
  overtimeHours: z.string(),
  earned: money,
  overtimeAmount: money,
  total: money,
});

export const GetConstructionLabourEmployeeAttendanceMonthResponseModel =
  z.object({
    projectId: z.uuid(),
    month: z.string(),
    from: z.iso.date(),
    to: z.iso.date(),
    dates: z.array(z.iso.date()),
    employees: z.array(
      z.object({
        employeeId: z.uuid(),
        name: z.string(),
        employeeCode: z.string().nullable(),
        /** Marked dates only. */
        days: z.array(
          z.object({
            date: z.iso.date(),
            attendanceId: z.uuid(),
            /** P, H (half), A, L (unpaid leave), PL (paid leave), HO (holiday). */
            code: z.enum(["P", "H", "A", "L", "PL", "HO"]),
            status,
            isPaidLeave: z.boolean(),
            overtimeHours: z.string(),
            earned: money,
            overtimeAmount: money,
          }),
        ),
        totals: totalsModel,
      }),
    ),
    dayCounts: z.array(
      z.object({
        date: z.iso.date(),
        present: z.int(),
        halfDay: z.int(),
        marked: z.int(),
      }),
    ),
    totals: totalsModel,
  });

export type GetConstructionLabourEmployeeAttendanceMonthResponseModel = z.infer<
  typeof GetConstructionLabourEmployeeAttendanceMonthResponseModel
>;

// Mappers

function amount(value: number | null, financial: boolean): number | null {
  return financial ? value : null;
}

export function toLabourAttendanceDayResponse(
  day: LabourAttendanceDayReadModel,
  financial: boolean,
): ConstructionLabourEmployeeAttendanceDayResponseModel {
  return {
    id: day.id,
    projectId: day.projectId,
    employeeId: day.employeeId,
    employeeName: day.employeeName,
    employeeCode: day.employeeCode,
    date: day.date,
    status: day.status,
    isPaidLeave: day.isPaidLeave,
    shift: day.shift,
    checkIn: day.checkIn,
    checkOut: day.checkOut,
    breakMinutes: day.breakMinutes,
    timesFromCheckIn: day.timesFromCheckIn,
    workingHours: day.workingHours,
    workedHours: day.workedHours,
    wageType: day.wageType,
    wageRate: amount(day.wageRate, financial),
    earned: amount(day.earned, financial),
    overtime: day.overtime.map((line) => ({
      labourCategoryId: line.labourCategoryId,
      labourCategoryName: line.labourCategoryName,
      hours: line.hours,
      ratePerHour: amount(line.ratePerHour, financial),
      amount: amount(line.amount, financial),
      fromTimes: line.fromTimes,
    })),
    overtimeHours: day.overtimeHours,
    overtimeAmount: amount(day.overtimeAmount, financial),
    total: amount(day.total, financial),
    createdAt: day.createdAt.toISOString(),
    updatedAt: day.updatedAt.toISOString(),
  };
}

export function toLabourAttendanceSheetResponse(
  sheet: LabourSheetReadModel,
  financial: boolean,
): GetConstructionLabourEmployeeAttendanceSheetResponseModel {
  return {
    projectId: sheet.projectId,
    date: sheet.date,
    employees: sheet.employees.map((row) => ({
      ...row,
      wagePerDay: amount(row.wagePerDay, financial),
      wagePerMonth: amount(row.wagePerMonth, financial),
      overtimeWagePerHour: amount(row.overtimeWagePerHour, financial),
      attendance:
        row.attendance == null
          ? null
          : toLabourAttendanceDayResponse(row.attendance, financial),
    })),
    labourCategories: sheet.labourCategories,
    totals: {
      ...sheet.totals,
      earned: amount(sheet.totals.earned, financial),
      overtimeAmount: amount(sheet.totals.overtimeAmount, financial),
    },
  };
}

function totals(value: LabourMonthTotals, financial: boolean) {
  return {
    ...value,
    earned: amount(value.earned, financial),
    overtimeAmount: amount(value.overtimeAmount, financial),
    total: amount(value.total, financial),
  };
}

export function toLabourAttendanceMonthResponse(
  month: LabourMonthReadModel,
  financial: boolean,
): GetConstructionLabourEmployeeAttendanceMonthResponseModel {
  return {
    projectId: month.projectId,
    month: month.month,
    from: month.from,
    to: month.to,
    dates: month.dates,
    employees: month.employees.map((row) => ({
      employeeId: row.employeeId,
      name: row.name,
      employeeCode: row.employeeCode,
      days: row.days.map((day) => ({
        ...day,
        earned: amount(day.earned, financial),
        overtimeAmount: amount(day.overtimeAmount, financial),
      })),
      totals: totals(row.totals, financial),
    })),
    dayCounts: month.dayCounts,
    totals: totals(month.totals, financial),
  };
}

/** `{ employeeId: iso }` → `{ employeeId: Date }`. */
export function expectedDates(
  expected: Record<string, string> | undefined,
): Record<string, Date> {
  return Object.fromEntries(
    Object.entries(expected ?? {}).map(([id, at]) => [id, new Date(at)]),
  );
}
