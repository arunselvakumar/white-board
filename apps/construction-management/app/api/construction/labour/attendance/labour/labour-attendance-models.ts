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

// Requests

export const GetConstructionLabourLabourAttendanceSheetRequestModel = z.object({
  projectId: z.uuid(),
  /** `YYYY-MM-DD`. */
  date: z.iso.date(),
});

export const MarkConstructionLabourLabourAttendanceRequestModel = z.object({
  projectId: z.uuid(),
  /** `YYYY-MM-DD`, not in the future. */
  date: z.iso.date(),
  /** One per labourer; send only the rows that changed. */
  marks: z
    .array(
      z.object({
        labourId: z.uuid(),
        status,
        /** Only on `on_leave`. */
        isPaidLeave: z.boolean().optional(),
        /** Free label: General, Shift 1, Shift 2, Shift 3. */
        shift: z.string().max(40).nullable().optional(),
        /** Snapshot; leave out to use the labourer's own Supervisor. */
        supervisorId: z.uuid().nullable().optional(),
        overtime: z
          .array(
            z.object({
              labourCategoryId: z.uuid().nullable(),
              /** Decimal hours, 0 < h ≤ 24, two places at most. */
              hours: z.union([z.string().max(12), z.number()]),
              /** Paise per hour; leave out for the labourer's overtime wage. */
              ratePerHour: z.int().nullable().optional(),
            }),
          )
          .max(10)
          .optional(),
      }),
    )
    .min(1)
    .max(500),
  /**
   * `updatedAt` of every already-marked row being changed, by labourer id.
   * A marked row without its entry, or with a stale one, is 409
   * `ATTENDANCE_CHANGED` with `details.labourId`.
   */
  expected: z.record(z.string(), z.iso.datetime()).optional(),
});

export type MarkConstructionLabourLabourAttendanceRequestModel = z.infer<
  typeof MarkConstructionLabourLabourAttendanceRequestModel
>;

export const ClearConstructionLabourLabourAttendanceRequestModel = z.object({
  projectId: z.uuid(),
  date: z.iso.date(),
  labourIds: z.array(z.uuid()).min(1).max(500),
  /** `updatedAt` of each row as last seen, by labourer id. */
  expected: z.record(z.string(), z.iso.datetime()),
});

export type ClearConstructionLabourLabourAttendanceRequestModel = z.infer<
  typeof ClearConstructionLabourLabourAttendanceRequestModel
>;

export const ConstructionLabourLabourAttendanceParamsModel = z.object({
  id: z.uuid(),
});

export const SetConstructionLabourLabourAttendancePaidLeaveRequestModel =
  z.object({
    isPaidLeave: z.boolean(),
    expectedUpdatedAt: z.iso.datetime(),
  });

export type SetConstructionLabourLabourAttendancePaidLeaveRequestModel =
  z.infer<typeof SetConstructionLabourLabourAttendancePaidLeaveRequestModel>;

export const ListConstructionLabourLabourAttendanceRequestModel = z
  .object({
    projectId: z.uuid(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    labourId: z.uuid().optional(),
    /** The Supervisor snapshot on the day. */
    supervisorId: z.uuid().optional(),
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

export const GetConstructionLabourLabourAttendanceMonthRequestModel = z.object({
  projectId: z.uuid(),
  /** `YYYY-MM`. */
  month: z.string().regex(MONTH_RE, "Use YYYY-MM."),
});

// Responses (amounts are paise; null without `labour.labour` Financial)

const money = z.int().nullable();
const ref = z.object({ id: z.uuid(), name: z.string() });

export const ConstructionLabourLabourAttendanceOvertimeResponseModel = z.object(
  {
    labourCategoryId: z.uuid().nullable(),
    labourCategoryName: z.string().nullable(),
    /** Decimal hours. */
    hours: z.string(),
    ratePerHour: money,
    amount: money,
  },
);

export const ConstructionLabourLabourAttendanceDayResponseModel = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  labourId: z.uuid(),
  labourName: z.string(),
  labourCode: z.string().nullable(),
  date: z.iso.date(),
  status,
  isPaidLeave: z.boolean(),
  shift: z.string().nullable(),
  supervisor: ref.nullable(),
  wageType: z.enum(["daily", "monthly"]),
  /** Snapshot wage per day or per month. */
  wageRate: money,
  /** What the day pays before overtime. */
  earned: money,
  overtime: z.array(ConstructionLabourLabourAttendanceOvertimeResponseModel),
  overtimeHours: z.string(),
  overtimeAmount: money,
  total: money,
  createdAt: z.iso.datetime(),
  /** Send back in `expected` to change or clear the day. */
  updatedAt: z.iso.datetime(),
});

export type ConstructionLabourLabourAttendanceDayResponseModel = z.infer<
  typeof ConstructionLabourLabourAttendanceDayResponseModel
>;

export const MarkConstructionLabourLabourAttendanceResponseModel = z.object({
  items: z.array(ConstructionLabourLabourAttendanceDayResponseModel),
});

export type MarkConstructionLabourLabourAttendanceResponseModel = z.infer<
  typeof MarkConstructionLabourLabourAttendanceResponseModel
>;

export const GetConstructionLabourLabourAttendanceSheetResponseModel = z.object(
  {
    projectId: z.uuid(),
    date: z.iso.date(),
    labourers: z.array(
      z.object({
        labourId: z.uuid(),
        name: z.string(),
        labourCode: z.string().nullable(),
        labourCategory: ref.nullable(),
        supervisor: ref.nullable(),
        /** 0 = Sunday … 6 = Saturday. */
        weeklyHolidays: z.array(z.int()),
        wageType: z.enum(["daily", "monthly"]).nullable(),
        wagePerDay: money,
        wagePerMonth: money,
        /** The default rate of a new overtime line. */
        overtimeWagePerHour: money,
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
          })
          .nullable(),
        attendance:
          ConstructionLabourLabourAttendanceDayResponseModel.nullable(),
      }),
    ),
    labourCategories: z.array(ref),
    supervisors: z.array(ref),
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
  },
);

export type GetConstructionLabourLabourAttendanceSheetResponseModel = z.infer<
  typeof GetConstructionLabourLabourAttendanceSheetResponseModel
>;

export const ListConstructionLabourLabourAttendanceResponseModel = z.object({
  items: z.array(ConstructionLabourLabourAttendanceDayResponseModel),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.int().nonnegative(),
});

export type ListConstructionLabourLabourAttendanceResponseModel = z.infer<
  typeof ListConstructionLabourLabourAttendanceResponseModel
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

export const GetConstructionLabourLabourAttendanceMonthResponseModel = z.object(
  {
    projectId: z.uuid(),
    month: z.string(),
    from: z.iso.date(),
    to: z.iso.date(),
    dates: z.array(z.iso.date()),
    labourers: z.array(
      z.object({
        labourId: z.uuid(),
        name: z.string(),
        labourCode: z.string().nullable(),
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
  },
);

export type GetConstructionLabourLabourAttendanceMonthResponseModel = z.infer<
  typeof GetConstructionLabourLabourAttendanceMonthResponseModel
>;

// Mappers

function amount(value: number | null, financial: boolean): number | null {
  return financial ? value : null;
}

export function toLabourAttendanceDayResponse(
  day: LabourAttendanceDayReadModel,
  financial: boolean,
): ConstructionLabourLabourAttendanceDayResponseModel {
  return {
    id: day.id,
    projectId: day.projectId,
    labourId: day.labourId,
    labourName: day.labourName,
    labourCode: day.labourCode,
    date: day.date,
    status: day.status,
    isPaidLeave: day.isPaidLeave,
    shift: day.shift,
    supervisor: day.supervisor,
    wageType: day.wageType,
    wageRate: amount(day.wageRate, financial),
    earned: amount(day.earned, financial),
    overtime: day.overtime.map((line) => ({
      labourCategoryId: line.labourCategoryId,
      labourCategoryName: line.labourCategoryName,
      hours: line.hours,
      ratePerHour: amount(line.ratePerHour, financial),
      amount: amount(line.amount, financial),
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
): GetConstructionLabourLabourAttendanceSheetResponseModel {
  return {
    projectId: sheet.projectId,
    date: sheet.date,
    labourers: sheet.labourers.map((row) => ({
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
    supervisors: sheet.supervisors,
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
): GetConstructionLabourLabourAttendanceMonthResponseModel {
  return {
    projectId: month.projectId,
    month: month.month,
    from: month.from,
    to: month.to,
    dates: month.dates,
    labourers: month.labourers.map((row) => ({
      labourId: row.labourId,
      name: row.name,
      labourCode: row.labourCode,
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

/** `{ labourId: iso }` → `{ labourId: Date }`. */
export function expectedDates(
  expected: Record<string, string> | undefined,
): Record<string, Date> {
  return Object.fromEntries(
    Object.entries(expected ?? {}).map(([id, at]) => [id, new Date(at)]),
  );
}
