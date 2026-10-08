import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";

import type { NewLedgerEntry } from "./ledger";
import { vendorLineAmount } from "./wages";
import { parseDecimal } from "@/src/shared-kernel/decimal";

export type VendorLineInput = {
  shiftId: string;
  labourCategoryId: string;
  fullDayCount: number;
  halfDayCount: number;
  /** Total overtime hours for the line, not per head. */
  overtimeHours?: string | number;
};

/** A vendor's live rate card, as the attendance command reads it. */
export type RateCard = ReadonlyMap<
  string,
  {
    name: string;
    rates: ReadonlyMap<string, { ratePerDay: number; overtimePerHour: number }>;
  }
>;

export type PricedVendorLine = {
  shiftId: string;
  shiftName: string;
  labourCategoryId: string;
  fullDayCount: number;
  halfDayCount: number;
  overtimeHours: string;
  ratePerDay: number;
  overtimePerHour: number;
  amount: number;
};

export type PricedVendorDay = {
  vendorId: string;
  projectId: string;
  date: CalendarDate;
  lines: PricedVendorLine[];
  totalPay: number;
};

const MAX_HEADCOUNT = 10_000;
const MAX_LINE_OVERTIME_HOURS = 10_000;

function count(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_HEADCOUNT)
    throw new DomainError(
      "HEADCOUNT_INVALID",
      "Full and half day counts are whole numbers, zero or more.",
      { details: { field } },
    );
  return value;
}

function lineHours(raw: string | number | undefined): string {
  if (raw == null || raw === "") return "0";
  let scale: number;
  let numerator: bigint;
  try {
    ({ numerator, scale } = parseDecimal(raw));
  } catch {
    throw hoursInvalid();
  }
  if (scale > 2 || numerator < 0n) throw hoursInvalid();
  const text = typeof raw === "number" ? String(raw) : raw.trim();
  if (Number(text) > MAX_LINE_OVERTIME_HOURS) throw hoursInvalid();
  return text;
}

function hoursInvalid(): DomainError {
  return new DomainError(
    "OVERTIME_HOURS_INVALID",
    "Overtime hours are zero or more, in steps of 0.01.",
  );
}

/**
 * Prices a vendor's day (CM-212, `modules/08` "Decisions for the build"):
 * one line per (shift, category) on the vendor's live rate card; pay =
 * full × rate + half × rate ÷ 2 + overtime hours × overtime rate.
 */
export function priceVendorDay(input: {
  vendorId: string;
  projectId: string;
  date: CalendarDate;
  lines: readonly VendorLineInput[];
  card: RateCard;
}): PricedVendorDay {
  if (input.lines.length === 0)
    throw new DomainError(
      "ATTENDANCE_EMPTY",
      "Enter the headcount for at least one category.",
    );
  const seen = new Set<string>();
  const lines = input.lines.map((line) => {
    const key = `${line.shiftId}:${line.labourCategoryId}`;
    if (seen.has(key))
      throw new DomainError(
        "DUPLICATE_SHIFT_CATEGORY",
        "Each category appears once per shift.",
        {
          details: {
            shiftId: line.shiftId,
            labourCategoryId: line.labourCategoryId,
          },
        },
      );
    seen.add(key);
    const shift = input.card.get(line.shiftId);
    if (shift == null)
      throw new DomainError(
        "SHIFT_NOT_FOUND",
        "This shift is not on the vendor's rate card.",
        { details: { shiftId: line.shiftId } },
      );
    const rate = shift.rates.get(line.labourCategoryId);
    if (rate == null)
      throw new DomainError(
        "CATEGORY_NOT_ON_SHIFT",
        "This category has no rate on that shift of the vendor's rate card.",
        {
          details: {
            shiftId: line.shiftId,
            labourCategoryId: line.labourCategoryId,
          },
        },
      );
    const fullDayCount = count(line.fullDayCount, "fullDayCount");
    const halfDayCount = count(line.halfDayCount, "halfDayCount");
    const overtimeHours = lineHours(line.overtimeHours);
    if (fullDayCount === 0 && halfDayCount === 0 && Number(overtimeHours) === 0)
      throw new DomainError(
        "LINE_EMPTY",
        "A line needs a full day, a half day or overtime.",
        {
          details: {
            shiftId: line.shiftId,
            labourCategoryId: line.labourCategoryId,
          },
        },
      );
    return {
      shiftId: line.shiftId,
      shiftName: shift.name,
      labourCategoryId: line.labourCategoryId,
      fullDayCount,
      halfDayCount,
      overtimeHours,
      ratePerDay: rate.ratePerDay,
      overtimePerHour: rate.overtimePerHour,
      amount: vendorLineAmount({
        fullDayCount,
        halfDayCount,
        overtimeHours,
        ratePerDay: rate.ratePerDay,
        overtimePerHour: rate.overtimePerHour,
      }),
    };
  });
  return {
    vendorId: input.vendorId,
    projectId: input.projectId,
    date: input.date,
    lines,
    totalPay: lines.reduce((sum, line) => sum + line.amount, 0),
  };
}

/** The vendor ledger entry a priced day posts (ADR CM-0004). */
export function vendorDayLedgerEntries(
  day: PricedVendorDay,
  attendanceId: string,
): NewLedgerEntry[] {
  return [
    {
      partyType: "vendor",
      partyId: day.vendorId,
      projectId: day.projectId,
      entryDate: day.date,
      kind: "earned",
      amount: day.totalPay,
      sourceType: "vendor_attendance",
      sourceId: attendanceId,
      reversesEntryId: null,
    },
  ];
}
