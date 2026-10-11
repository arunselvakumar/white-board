import type { CalendarDate } from "@/src/shared-kernel/calendar-date";

import {
  column,
  totalsOf,
  type Cell,
  type ReportBody,
  type ReportColumn,
} from "./report-document";
import { dateLabel } from "./report-period";
import {
  decimalOf,
  REPORT_SHIFT_LABELS,
  trimDecimal,
  type ReportShift,
} from "./site-work-labels";

/** One consumed material line of a worksheet. */
export type ReportWorksheetMaterial = {
  name: string;
  unit: string;
  /** Decimal string, ≤ 3 decimals. */
  quantity: string;
};

/** A live, not rejected Daily Worksheet with its names resolved. */
export type ReportWorksheet = {
  date: CalendarDate;
  number: string;
  department: string;
  contractor: string;
  skilled: number | null;
  unskilled: number | null;
  /** "Wing", "Amenity", "Common Development" or "Location"; null when none. */
  locationType: string | null;
  /** The one-line LocationRef label. */
  location: string | null;
  /** Decimal string; null when not recorded. */
  approxWorkQty: string | null;
  approxWorkUnit: string | null;
  shift: ReportShift;
  photos: number;
  materials: readonly ReportWorksheetMaterial[];
  remark: string | null;
};

/** `Cement 10 Bag; Sand 2 cum`. */
export function consumedText(
  materials: readonly ReportWorksheetMaterial[],
): string {
  return materials
    .map(
      (line) =>
        `${line.name} ${trimDecimal(line.quantity)}${line.unit === "" ? "" : ` ${line.unit}`}`,
    )
    .join("; ");
}

function approxWork(sheet: ReportWorksheet): string | null {
  if (sheet.approxWorkQty == null) return null;
  const quantity = trimDecimal(sheet.approxWorkQty);
  return sheet.approxWorkUnit == null
    ? quantity
    : `${quantity} ${sheet.approxWorkUnit}`;
}

/** Thousandths, so quantities add exactly. */
function milli(quantity: string): number {
  return Math.round((decimalOf(quantity) ?? 0) * 1000);
}

/**
 * Daily Work (CM-608, `modules/04` "Reports & exports"): every worksheet
 * in the period, one row each, with its labour, location, work done,
 * shift, photo count and consumed materials; then the materials consumed
 * in all, per material and unit.
 */
export function buildDailyWorkReport(input: {
  worksheets: readonly ReportWorksheet[];
  filters: { contractor: string | null };
}): ReportBody {
  const columns: ReportColumn[] = [
    column("Date", "text", 11),
    column("Number", "text", 14),
    column("Department", "text", 14),
    column("Contractor", "text", 18),
    column("Skilled", "count"),
    column("Unskilled", "count", 8),
    column("Location type", "text", 11),
    column("Location", "text", 18),
    column("Approx work done", "text", 12),
    column("Shift", "text", 8),
    column("Photos", "count", 6),
    column("Consumed material", "text", 26),
    column("Remark", "text", 20),
  ];
  const sheets = [...input.worksheets].sort(
    (a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number),
  );
  const rows: Cell[][] = sheets.map((sheet) => [
    dateLabel(sheet.date),
    sheet.number,
    sheet.department,
    sheet.contractor,
    sheet.skilled ?? 0,
    sheet.unskilled ?? 0,
    sheet.locationType,
    sheet.location,
    approxWork(sheet),
    REPORT_SHIFT_LABELS[sheet.shift],
    sheet.photos,
    consumedText(sheet.materials),
    sheet.remark,
  ]);
  const totals = totalsOf(columns, rows, { 0: "Total" });

  const consumed = new Map<
    string,
    { name: string; unit: string; milli: number; sheets: number }
  >();
  for (const sheet of sheets)
    for (const line of sheet.materials) {
      const key = `${line.name}\u0000${line.unit}`;
      const entry = consumed.get(key) ?? {
        name: line.name,
        unit: line.unit,
        milli: 0,
        sheets: 0,
      };
      entry.milli += milli(line.quantity);
      entry.sheets += 1;
      consumed.set(key, entry);
    }
  const materialColumns = [
    column("Material", "text", 24),
    column("Unit", "text", 10),
    column("Quantity", "quantity", 12),
    column("Worksheets", "count", 10),
  ];
  const materialRows: Cell[][] = [...consumed.values()]
    .sort(
      (a, b) => a.name.localeCompare(b.name) || a.unit.localeCompare(b.unit),
    )
    .map((entry) => [entry.name, entry.unit, entry.milli / 1000, entry.sheets]);

  return {
    title: "Daily Work Report",
    notes: [
      ...(input.filters.contractor == null
        ? []
        : [`Contractor: ${input.filters.contractor}`]),
      "Every live worksheet in the period; rejected worksheets are left out.",
    ],
    tables: [
      { name: "Daily work", columns, rows, totals },
      // Quantities in different units never add up: no totals row.
      {
        name: "Material consumed",
        columns: materialColumns,
        rows: materialRows,
        totals: null,
      },
    ],
  };
}
