import { z } from "zod";

import { QueryHttpError } from "@/src/queries/http";
import type {
  RecordVendorDayInput,
  VendorAttendanceDay,
  VendorAttendanceGridRow,
} from "@/src/queries/vendor-attendance";

/** Whole heads as typed; empty is zero. */
const COUNT_RE = /^\d{0,5}$/;
/** Hours as typed: up to two decimals; empty is zero. */
const HOURS_RE = /^(\d{1,4}(\.\d{0,2})?)?$/;

export const vendorDayFormSchema = z.object({
  lines: z.array(
    z.object({
      shiftId: z.string(),
      labourCategoryId: z.string(),
      full: z.string().trim().regex(COUNT_RE, "Whole number"),
      half: z.string().trim().regex(COUNT_RE, "Whole number"),
      overtime: z.string().trim().regex(HOURS_RE, "Hours, up to 2 decimals"),
    }),
  ),
});

export type VendorDayFormValues = z.infer<typeof vendorDayFormSchema>;
export type VendorDayFormLine = VendorDayFormValues["lines"][number];

/** One input row per (shift, category) on the rate card, in card order. */
export type RateRow = {
  shiftId: string;
  shiftName: string;
  labourCategoryId: string;
  labourCategoryName: string;
  ratePerDay: number | null;
  overtimePerHour: number | null;
};

export function rateRows(row: VendorAttendanceGridRow): RateRow[] {
  return row.shifts.flatMap((shift) =>
    shift.rates.map((rate) => ({
      shiftId: shift.id,
      shiftName: shift.name,
      labourCategoryId: rate.labourCategoryId,
      labourCategoryName: rate.labourCategoryName ?? "Deleted category",
      ratePerDay: rate.ratePerDay,
      overtimePerHour: rate.overtimePerHour,
    })),
  );
}

function text(value: number): string {
  return value === 0 ? "" : String(value);
}

/** The form for a vendor's day: the rate card rows, filled from `day` when given. */
export function vendorDayDefaults(
  rows: readonly RateRow[],
  day: Pick<VendorAttendanceDay, "lines"> | null,
): VendorDayFormValues {
  return {
    lines: rows.map((row) => {
      const line = day?.lines.find(
        (item) =>
          item.shiftId === row.shiftId &&
          item.labourCategoryId === row.labourCategoryId,
      );
      return {
        shiftId: row.shiftId,
        labourCategoryId: row.labourCategoryId,
        full: text(line?.fullDayCount ?? 0),
        half: text(line?.halfDayCount ?? 0),
        overtime:
          line == null || Number(line.overtimeHours) === 0
            ? ""
            : line.overtimeHours,
      };
    }),
  };
}

function count(value: string): number {
  const trimmed = value.trim();
  return COUNT_RE.test(trimmed) && trimmed.length > 0 ? Number(trimmed) : 0;
}

/** Hours as whole hundredths (exact). */
function hundredths(value: string): number {
  const trimmed = value.trim();
  if (trimmed.length === 0 || !HOURS_RE.test(trimmed)) return 0;
  const [whole = "0", fraction = ""] = trimmed.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function isEmptyLine(line: VendorDayFormLine): boolean {
  return (
    count(line.full) === 0 &&
    count(line.half) === 0 &&
    hundredths(line.overtime) === 0
  );
}

/**
 * The server's formula, for the on-screen preview: full × rate + half ×
 * rate ÷ 2 + overtime hours × overtime rate, rounded half up to the paisa.
 * Null when the rates are hidden (no Financial).
 */
export function previewLinePay(
  line: VendorDayFormLine,
  rate: Pick<RateRow, "ratePerDay" | "overtimePerHour">,
): number | null {
  if (rate.ratePerDay == null || rate.overtimePerHour == null) return null;
  const scaled =
    rate.ratePerDay * (200 * count(line.full) + 100 * count(line.half)) +
    2 * hundredths(line.overtime) * rate.overtimePerHour;
  return Math.floor((scaled + 100) / 200);
}

export function previewDayPay(
  lines: readonly VendorDayFormLine[],
  rows: readonly RateRow[],
): number | null {
  let total = 0;
  for (const [index, line] of lines.entries()) {
    const row = rows[index];
    if (row == null) continue;
    const pay = previewLinePay(line, row);
    if (pay == null) return null;
    total += pay;
  }
  return total;
}

/** The record body: only lines with a headcount or overtime. */
export function vendorDayPayload(input: {
  projectId: string;
  vendorId: string;
  date: string;
  values: VendorDayFormValues;
  expectedUpdatedAt: string | null;
}): RecordVendorDayInput {
  return {
    projectId: input.projectId,
    vendorId: input.vendorId,
    date: input.date,
    lines: input.values.lines
      .filter((line) => !isEmptyLine(line))
      .map((line) => ({
        shiftId: line.shiftId,
        labourCategoryId: line.labourCategoryId,
        fullDayCount: count(line.full),
        halfDayCount: count(line.half),
        ...(hundredths(line.overtime) > 0
          ? { overtimeHours: line.overtime.trim() }
          : {}),
      })),
    ...(input.expectedUpdatedAt == null
      ? {}
      : { expectedUpdatedAt: input.expectedUpdatedAt }),
  };
}

/** Which input of which line a server error is about, from `details`. */
export function lineErrorTarget(
  error: unknown,
  lines: readonly VendorDayFormLine[],
): { index: number; field: "full" | "half" | "overtime" } | null {
  if (!(error instanceof QueryHttpError)) return null;
  const details =
    error.details != null && typeof error.details === "object"
      ? (error.details as Record<string, unknown>)
      : {};
  const index = lines.findIndex(
    (line) =>
      line.shiftId === details["shiftId"] &&
      line.labourCategoryId === details["labourCategoryId"],
  );
  if (index < 0) return null;
  if (error.code === "OVERTIME_HOURS_INVALID")
    return { index, field: "overtime" };
  if (details["field"] === "halfDayCount") return { index, field: "half" };
  return { index, field: "full" };
}
