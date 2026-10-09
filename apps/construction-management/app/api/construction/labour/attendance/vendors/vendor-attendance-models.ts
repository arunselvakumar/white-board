import { z } from "zod";

import type {
  VendorAttendanceDayReadModel,
  VendorCounts,
  VendorDayGridReadModel,
  VendorMonthReadModel,
  VendorOvertimeReadModel,
} from "@/src/labour/application/vendor-attendance-handlers";

export const VENDOR_ATTENDANCE_PATH =
  "/api/construction/labour/attendance/vendors";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// Requests

export const GetConstructionLabourVendorAttendanceDayRequestModel = z.object({
  projectId: z.uuid(),
  /** `YYYY-MM-DD`. */
  date: z.iso.date(),
});

export const RecordConstructionLabourVendorAttendanceRequestModel = z.object({
  projectId: z.uuid(),
  vendorId: z.uuid(),
  /** `YYYY-MM-DD`, not in the future. */
  date: z.iso.date(),
  /** One line per (shift, category) of the vendor's rate card. */
  lines: z
    .array(
      z.object({
        shiftId: z.uuid(),
        labourCategoryId: z.uuid(),
        /** Whole heads, ≥ 0. */
        fullDayCount: z.int(),
        halfDayCount: z.int(),
        /** Total overtime hours for the line (not per head), ≥ 0, 2 decimals. */
        overtimeHours: z.string().max(12).optional(),
      }),
    )
    .max(200),
  /**
   * The `updatedAt` of the recorded day being changed; leave out (or null)
   * to record a new day. 409 `VENDOR_ATTENDANCE_CHANGED` when stale.
   */
  expectedUpdatedAt: z.iso.datetime().nullable().optional(),
});

export type RecordConstructionLabourVendorAttendanceRequestModel = z.infer<
  typeof RecordConstructionLabourVendorAttendanceRequestModel
>;

export const ClearConstructionLabourVendorAttendanceRequestModel = z.object({
  /** The day's `updatedAt` as last seen; 409 when someone changed it since. */
  expectedUpdatedAt: z.iso.datetime().nullable().optional(),
});

export const ConstructionLabourVendorAttendanceParamsModel = z.object({
  id: z.uuid(),
});

export const ListConstructionLabourVendorAttendanceRequestModel = z.object({
  projectId: z.uuid(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  vendorId: z.uuid().optional(),
  /** Days with a line in this Labour Category. */
  categoryId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(200).optional().default(50),
});

export const GetConstructionLabourVendorAttendanceMonthRequestModel = z.object({
  projectId: z.uuid(),
  /** `YYYY-MM`. */
  month: z.string().regex(MONTH_RE, "Use YYYY-MM."),
});

export const GetConstructionLabourVendorAttendanceOvertimeRequestModel =
  z.object({
    projectId: z.uuid(),
    from: z.iso.date(),
    /** At most 366 days after `from`. */
    to: z.iso.date(),
  });

// Responses (amounts are paise; null without `labour.vendor` Financial)

const money = z.int().nullable();

export const ConstructionLabourVendorAttendanceLineResponseModel = z.object({
  shiftId: z.uuid(),
  /** The shift's name when the line was saved. */
  shiftName: z.string(),
  labourCategoryId: z.uuid(),
  /** Null when the category was deleted from Masters. */
  labourCategoryName: z.string().nullable(),
  fullDayCount: z.int(),
  halfDayCount: z.int(),
  /** Decimal hours, total for the line. */
  overtimeHours: z.string(),
  /** Snapshot rates; null without Financial. */
  ratePerDay: money,
  overtimePerHour: money,
  /** full × rate + half × rate ÷ 2 + overtime hours × overtime rate. */
  amount: money,
});

export const ConstructionLabourVendorAttendanceDayResponseModel = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  vendorId: z.uuid(),
  vendorName: z.string(),
  date: z.iso.date(),
  totalPay: money,
  fullDayCount: z.int(),
  halfDayCount: z.int(),
  overtimeHours: z.string(),
  lines: z.array(ConstructionLabourVendorAttendanceLineResponseModel),
  createdAt: z.iso.datetime(),
  /** Send back as `expectedUpdatedAt` to change or clear the day. */
  updatedAt: z.iso.datetime(),
});

export type ConstructionLabourVendorAttendanceDayResponseModel = z.infer<
  typeof ConstructionLabourVendorAttendanceDayResponseModel
>;

export const GetConstructionLabourVendorAttendanceDayResponseModel = z.object({
  projectId: z.uuid(),
  date: z.iso.date(),
  totalPay: money,
  vendors: z.array(
    z.object({
      vendorId: z.uuid(),
      vendorName: z.string(),
      /** Active, assigned to the Project and with a rate card. */
      canRecord: z.boolean(),
      onProject: z.boolean(),
      isActive: z.boolean(),
      hasRateCard: z.boolean(),
      shifts: z.array(
        z.object({
          id: z.uuid(),
          name: z.string(),
          startTime: z.string().nullable(),
          endTime: z.string().nullable(),
          rates: z.array(
            z.object({
              labourCategoryId: z.uuid(),
              labourCategoryName: z.string().nullable(),
              ratePerDay: money,
              overtimePerHour: money,
            }),
          ),
        }),
      ),
      attendance: ConstructionLabourVendorAttendanceDayResponseModel.nullable(),
    }),
  ),
});

export type GetConstructionLabourVendorAttendanceDayResponseModel = z.infer<
  typeof GetConstructionLabourVendorAttendanceDayResponseModel
>;

export const ListConstructionLabourVendorAttendanceResponseModel = z.object({
  items: z.array(ConstructionLabourVendorAttendanceDayResponseModel),
  total: z.int().nonnegative(),
  page: z.int().positive(),
  pageSize: z.int().positive(),
});

export type ListConstructionLabourVendorAttendanceResponseModel = z.infer<
  typeof ListConstructionLabourVendorAttendanceResponseModel
>;

const countsModel = {
  fullDayCount: z.int(),
  halfDayCount: z.int(),
  overtimeHours: z.string(),
  pay: money,
};

export const GetConstructionLabourVendorAttendanceMonthResponseModel = z.object(
  {
    projectId: z.uuid(),
    month: z.string(),
    from: z.iso.date(),
    to: z.iso.date(),
    /** Every date of the month. */
    dates: z.array(z.iso.date()),
    vendors: z.array(
      z.object({
        vendorId: z.uuid(),
        vendorName: z.string(),
        /** Recorded dates only. */
        days: z.array(
          z.object({
            date: z.iso.date(),
            attendanceId: z.uuid(),
            ...countsModel,
          }),
        ),
        totals: z.object(countsModel),
      }),
    ),
    categories: z.array(
      z.object({
        labourCategoryId: z.uuid(),
        labourCategoryName: z.string().nullable(),
        ...countsModel,
      }),
    ),
    dayTotals: z.array(z.object({ date: z.iso.date(), ...countsModel })),
    totals: z.object(countsModel),
  },
);

export type GetConstructionLabourVendorAttendanceMonthResponseModel = z.infer<
  typeof GetConstructionLabourVendorAttendanceMonthResponseModel
>;

export const GetConstructionLabourVendorAttendanceOvertimeResponseModel =
  z.object({
    projectId: z.uuid(),
    from: z.iso.date(),
    to: z.iso.date(),
    items: z.array(
      z.object({
        attendanceId: z.uuid(),
        date: z.iso.date(),
        vendorId: z.uuid(),
        vendorName: z.string(),
        shiftId: z.uuid(),
        shiftName: z.string(),
        labourCategoryId: z.uuid(),
        labourCategoryName: z.string().nullable(),
        overtimeHours: z.string(),
        overtimePerHour: money,
        overtimeAmount: money,
      }),
    ),
    totalHours: z.string(),
    totalAmount: money,
  });

export type GetConstructionLabourVendorAttendanceOvertimeResponseModel =
  z.infer<typeof GetConstructionLabourVendorAttendanceOvertimeResponseModel>;

// Mappers

function amount(value: number, financial: boolean): number | null {
  return financial ? value : null;
}

export function toVendorAttendanceDayResponse(
  day: VendorAttendanceDayReadModel,
  financial: boolean,
): ConstructionLabourVendorAttendanceDayResponseModel {
  return {
    id: day.id,
    projectId: day.projectId,
    vendorId: day.vendorId,
    vendorName: day.vendorName,
    date: day.date,
    totalPay: amount(day.totalPay, financial),
    fullDayCount: day.fullDayCount,
    halfDayCount: day.halfDayCount,
    overtimeHours: day.overtimeHours,
    lines: day.lines.map((line) => ({
      shiftId: line.shiftId,
      shiftName: line.shiftName,
      labourCategoryId: line.labourCategoryId,
      labourCategoryName: line.labourCategoryName,
      fullDayCount: line.fullDayCount,
      halfDayCount: line.halfDayCount,
      overtimeHours: line.overtimeHours,
      ratePerDay: amount(line.ratePerDay, financial),
      overtimePerHour: amount(line.overtimePerHour, financial),
      amount: amount(line.amount, financial),
    })),
    createdAt: day.createdAt.toISOString(),
    updatedAt: day.updatedAt.toISOString(),
  };
}

export function toVendorAttendanceGridResponse(
  grid: VendorDayGridReadModel,
  financial: boolean,
): GetConstructionLabourVendorAttendanceDayResponseModel {
  return {
    projectId: grid.projectId,
    date: grid.date,
    totalPay: amount(grid.totalPay, financial),
    vendors: grid.vendors.map((row) => ({
      vendorId: row.vendorId,
      vendorName: row.vendorName,
      canRecord: row.canRecord,
      onProject: row.onProject,
      isActive: row.isActive,
      hasRateCard: row.hasRateCard,
      shifts: row.shifts.map((shift) => ({
        id: shift.id,
        name: shift.name,
        startTime: shift.startTime,
        endTime: shift.endTime,
        rates: shift.rates.map((rate) => ({
          labourCategoryId: rate.labourCategoryId,
          labourCategoryName: rate.labourCategoryName,
          ratePerDay: amount(rate.ratePerDay, financial),
          overtimePerHour: amount(rate.overtimePerHour, financial),
        })),
      })),
      attendance:
        row.attendance == null
          ? null
          : toVendorAttendanceDayResponse(row.attendance, financial),
    })),
  };
}

function counts<T extends VendorCounts>(
  value: T,
  financial: boolean,
): Omit<T, "pay"> & { pay: number | null } {
  return { ...value, pay: amount(value.pay, financial) };
}

export function toVendorAttendanceMonthResponse(
  month: VendorMonthReadModel,
  financial: boolean,
): GetConstructionLabourVendorAttendanceMonthResponseModel {
  return {
    projectId: month.projectId,
    month: month.month,
    from: month.from,
    to: month.to,
    dates: month.dates,
    vendors: month.vendors.map((row) => ({
      vendorId: row.vendorId,
      vendorName: row.vendorName,
      days: row.days.map((day) => counts(day, financial)),
      totals: counts(row.totals, financial),
    })),
    categories: month.categories.map((row) => counts(row, financial)),
    dayTotals: month.dayTotals.map((row) => counts(row, financial)),
    totals: counts(month.totals, financial),
  };
}

export function toVendorAttendanceOvertimeResponse(
  view: VendorOvertimeReadModel,
  financial: boolean,
): GetConstructionLabourVendorAttendanceOvertimeResponseModel {
  return {
    projectId: view.projectId,
    from: view.from,
    to: view.to,
    items: view.items.map((item) => ({
      ...item,
      overtimePerHour: amount(item.overtimePerHour, financial),
      overtimeAmount: amount(item.overtimeAmount, financial),
    })),
    totalHours: view.totalHours,
    totalAmount: amount(view.totalAmount, financial),
  };
}
