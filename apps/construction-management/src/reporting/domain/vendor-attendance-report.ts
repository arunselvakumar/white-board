import type { CalendarDate } from "@/src/shared-kernel/calendar-date";

import { hours } from "./labour-days";
import {
  column,
  totalsOf,
  type Cell,
  type ReportBody,
  type ReportColumn,
} from "./report-document";
import { dateLabel } from "./report-period";

/** One vendor attendance line with its rate snapshots (ADR CM-0004). */
export type ReportVendorLine = {
  date: CalendarDate;
  projectName: string;
  vendorName: string;
  shiftName: string;
  category: string;
  fullDayCount: number;
  halfDayCount: number;
  /** Hundredths of an hour, the whole line (not per head). */
  overtimeHundredths: number;
  /** Paise. */
  ratePerDay: number;
  overtimePerHour: number;
  amount: number;
};

/**
 * Vendor Attendance (CM-217): every vendor line per day, shift and Labour
 * Category with full and half days and overtime hours, plus rates and pay
 * with Vendor Financial (left out without it). The central report (all
 * the Projects the requester may see) adds a Project column.
 */
export function buildVendorAttendanceReport(input: {
  lines: readonly ReportVendorLine[];
  financial: boolean;
  central: boolean;
  filters: { vendor: string | null; category: string | null };
}): ReportBody {
  const columns: ReportColumn[] = [column("Date", "text", 11)];
  if (input.central) columns.push(column("Project", "text", 16));
  columns.push(
    column("Vendor", "text", 20),
    column("Shift", "text", 10),
    column("Category", "text", 14),
    column("Full day", "count"),
    column("Half day", "count"),
    column("OT hours", "hours"),
  );
  if (input.financial)
    columns.push(
      column("Rate/day", "money", 10),
      column("OT rate/hr", "money", 10),
      column("Pay", "money"),
    );

  const lines = [...input.lines].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.projectName.localeCompare(b.projectName) ||
      a.vendorName.localeCompare(b.vendorName) ||
      a.shiftName.localeCompare(b.shiftName) ||
      a.category.localeCompare(b.category),
  );
  const rows: Cell[][] = lines.map((line) => {
    const row: Cell[] = [dateLabel(line.date)];
    if (input.central) row.push(line.projectName);
    row.push(
      line.vendorName,
      line.shiftName,
      line.category,
      line.fullDayCount,
      line.halfDayCount,
      hours(line.overtimeHundredths),
    );
    if (input.financial)
      row.push(line.ratePerDay, line.overtimePerHour, line.amount);
    return row;
  });
  const totals = totalsOf(columns, rows, { 0: "Total" });
  if (input.financial) {
    // Rates do not add up.
    totals[columns.length - 3] = null;
    totals[columns.length - 2] = null;
  }

  const filters = [
    input.filters.vendor == null ? null : `Vendor: ${input.filters.vendor}`,
    input.filters.category == null
      ? null
      : `Labour Category: ${input.filters.category}`,
  ].filter((value): value is string => value != null);
  return {
    title: input.central
      ? "Central Vendor Attendance Report"
      : "Vendor Attendance Report",
    notes: [
      ...(filters.length > 0 ? [filters.join("; ")] : []),
      "OT hours are for the whole line, not per head.",
      ...(input.financial
        ? []
        : ["Rates and pay are left out: they need Vendor Financial."]),
    ],
    tables: [{ name: "Vendor attendance", columns, rows, totals }],
  };
}
