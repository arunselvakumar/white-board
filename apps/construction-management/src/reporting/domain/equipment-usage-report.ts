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
  FUEL_UNIT_LABELS,
  HIRE_BASIS_LABELS,
  REPORT_APPROVAL_LABELS,
  REPORT_SHIFT_LABELS,
  USAGE_UNITS,
  type ReportApproval,
  type ReportShift,
  type ReportUtilisationBasis,
} from "./site-work-labels";

/** A live, not rejected Equipment Usage sheet with its names resolved. */
export type ReportUsageSheet = {
  date: CalendarDate;
  number: string;
  equipmentId: string;
  equipment: string;
  equipmentNumber: string;
  shift: ReportShift;
  operator: string | null;
  /** The basis copied on the sheet: what `usage` counts. */
  basis: ReportUtilisationBasis;
  /** Hours, km or trips by `basis`; null when not recorded. */
  usage: number | null;
  idleHours: number;
  breakdownHours: number;
  fuelQty: number | null;
  /** The equipment's fuel unit (`litre`); null when it has none. */
  fuelUnit: string | null;
  fuelOverrun: boolean;
  contractor: string | null;
  location: string | null;
  approval: ReportApproval;
  /** Rented equipment: the hire party and basis on the register. */
  hireParty: string | null;
  hireBasis: string | null;
  /** Paise. */
  unitRate: number | null;
  billableQty: number | null;
  /** Paise. */
  hireCost: number | null;
};

/** Sum of the numbers when every row is in the same `unit`, else null. */
function sameUnitSum(
  rows: readonly { value: number | null; unit: string | null }[],
): number | null {
  const units = new Set(
    rows.filter((row) => row.value != null).map((row) => row.unit),
  );
  if (units.size !== 1) return units.size === 0 ? 0 : null;
  const scale = 1000;
  return (
    rows.reduce((sum, row) => sum + Math.round((row.value ?? 0) * scale), 0) /
    scale
  );
}

function fuelUnit(sheet: ReportUsageSheet): string | null {
  return sheet.fuelUnit == null
    ? null
    : (FUEL_UNIT_LABELS[sheet.fuelUnit] ?? sheet.fuelUnit);
}

/**
 * Company Owned Equipment Usage and Rented Equipment Usage (CM-608): every
 * usage sheet of the ownership in the period, one row each, then a summary
 * per machine. The rented report adds the hire party and basis, the
 * billable quantity and, with Financial on Equipment Usage, the unit rate
 * and hire cost with their total. Usage and fuel are totalled only when
 * every row is in one unit.
 */
export function buildEquipmentUsageReport(input: {
  ownership: "owned" | "rented";
  sheets: readonly ReportUsageSheet[];
  financial: boolean;
  filters: { equipment: string | null };
}): ReportBody {
  const rented = input.ownership === "rented";
  const money = rented && input.financial;
  const columns: ReportColumn[] = [
    column("Date", "text", 11),
    column("Number", "text", 14),
    column("Equipment", "text", 16),
    column("Equipment No.", "text", 12),
    column("Shift", "text", 8),
    column("Operator", "text", 14),
    column("Usage", "hours", 8),
    column("Unit", "text", 6),
    column("Idle hrs", "hours", 7),
    column("Breakdown hrs", "hours", 9),
    column("Fuel", "quantity", 8),
    column("Fuel unit", "text", 7),
    column("Fuel overrun", "text", 8),
    column("Contractor", "text", 16),
    column("Location", "text", 16),
    column("Approval", "text", 10),
  ];
  if (rented)
    columns.push(
      column("Hire party", "text", 16),
      column("Hire basis", "text", 9),
      column("Billable qty", "quantity", 9),
    );
  if (money)
    columns.push(
      column("Unit rate", "money", 10),
      column("Hire cost", "money"),
    );

  const sheets = [...input.sheets].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.equipment.localeCompare(b.equipment) ||
      a.shift.localeCompare(b.shift) ||
      a.number.localeCompare(b.number),
  );
  const rows: Cell[][] = sheets.map((sheet) => {
    const row: Cell[] = [
      dateLabel(sheet.date),
      sheet.number,
      sheet.equipment,
      sheet.equipmentNumber,
      REPORT_SHIFT_LABELS[sheet.shift],
      sheet.operator,
      sheet.usage,
      USAGE_UNITS[sheet.basis],
      sheet.idleHours,
      sheet.breakdownHours,
      sheet.fuelQty,
      fuelUnit(sheet),
      sheet.fuelOverrun ? "Yes" : "No",
      sheet.contractor,
      sheet.location,
      REPORT_APPROVAL_LABELS[sheet.approval],
    ];
    if (rented)
      row.push(
        sheet.hireParty,
        sheet.hireBasis == null
          ? null
          : (HIRE_BASIS_LABELS[sheet.hireBasis] ?? sheet.hireBasis),
        sheet.billableQty,
      );
    if (money) row.push(sheet.unitRate, sheet.hireCost);
    return row;
  });

  const totals = totalsOf(columns, rows, { 0: "Total" });
  const usageIndex = columns.findIndex((col) => col.label === "Usage");
  const fuelIndex = columns.findIndex((col) => col.label === "Fuel");
  totals[usageIndex] = sameUnitSum(
    sheets.map((sheet) => ({
      value: sheet.usage,
      unit: USAGE_UNITS[sheet.basis],
    })),
  );
  totals[fuelIndex] = sameUnitSum(
    sheets.map((sheet) => ({ value: sheet.fuelQty, unit: sheet.fuelUnit })),
  );
  totals[columns.findIndex((col) => col.label === "Fuel overrun")] = String(
    sheets.filter((sheet) => sheet.fuelOverrun).length,
  );
  if (rented)
    // Billable quantities are in each machine's hire basis: no total.
    totals[columns.findIndex((col) => col.label === "Billable qty")] = null;
  if (money)
    // Rates do not add up.
    totals[columns.findIndex((col) => col.label === "Unit rate")] = null;

  // Per machine: sheets and figures in its own units.
  const machines = new Map<string, ReportUsageSheet[]>();
  for (const sheet of sheets) {
    const own = machines.get(sheet.equipmentId) ?? [];
    own.push(sheet);
    machines.set(sheet.equipmentId, own);
  }
  const summaryColumns: ReportColumn[] = [
    column("Equipment", "text", 18),
    column("Equipment No.", "text", 12),
    column("Sheets", "count", 6),
    column("Usage", "hours", 9),
    column("Unit", "text", 6),
    column("Idle hrs", "hours", 8),
    column("Breakdown hrs", "hours", 9),
    column("Fuel", "quantity", 9),
    column("Fuel unit", "text", 7),
    column("Fuel overruns", "count", 8),
  ];
  if (money) summaryColumns.push(column("Hire cost", "money"));
  const summaryRows: Cell[][] = [...machines.values()]
    .sort(
      (a, b) =>
        (a[0]?.equipment ?? "").localeCompare(b[0]?.equipment ?? "") ||
        (a[0]?.equipmentNumber ?? "").localeCompare(
          b[0]?.equipmentNumber ?? "",
        ),
    )
    .map((own) => {
      const first = own[0];
      const hundredths = (pick: (sheet: ReportUsageSheet) => number) =>
        own.reduce((sum, sheet) => sum + Math.round(pick(sheet) * 100), 0) /
        100;
      const row: Cell[] = [
        first?.equipment ?? "",
        first?.equipmentNumber ?? "",
        own.length,
        sameUnitSum(
          own.map((sheet) => ({
            value: sheet.usage,
            unit: USAGE_UNITS[sheet.basis],
          })),
        ),
        // A machine's sheets copy one basis unless the register changed.
        [...new Set(own.map((sheet) => USAGE_UNITS[sheet.basis]))].join(", "),
        hundredths((sheet) => sheet.idleHours),
        hundredths((sheet) => sheet.breakdownHours),
        sameUnitSum(
          own.map((sheet) => ({ value: sheet.fuelQty, unit: sheet.fuelUnit })),
        ),
        first == null ? null : fuelUnit(first),
        own.filter((sheet) => sheet.fuelOverrun).length,
      ];
      if (money)
        row.push(
          own.some((sheet) => sheet.hireCost != null)
            ? own.reduce((sum, sheet) => sum + (sheet.hireCost ?? 0), 0)
            : null,
        );
      return row;
    });

  const filters =
    input.filters.equipment == null
      ? []
      : [`Equipment: ${input.filters.equipment}`];
  return {
    title: rented
      ? "Rented Equipment Usage Report"
      : "Company Owned Equipment Usage Report",
    notes: [
      ...filters,
      "Every live usage sheet in the period; rejected sheets are left out.",
      "Usage is in hours, km or trips by the equipment's utilisation basis; it is totalled only when every sheet is in one unit.",
      ...(rented && !input.financial
        ? [
            "Unit rate and hire cost are left out: they need Financial on Equipment Usage.",
          ]
        : []),
    ],
    tables: [
      { name: "Usage sheets", columns, rows, totals },
      {
        name: "By equipment",
        columns: summaryColumns,
        rows: summaryRows,
        totals: null,
      },
    ],
  };
}
