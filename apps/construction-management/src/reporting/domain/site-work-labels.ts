/**
 * Words the site-work reports print (CM-605, CM-608). Reporting is a read
 * model and never imports the site-work context, so the labels it shares
 * with those screens are repeated here (`CONTEXT.md` words).
 */

export type ReportShift = "shift_1" | "shift_2" | "shift_3";

export const REPORT_SHIFT_LABELS: Record<ReportShift, string> = {
  shift_1: "Shift 1",
  shift_2: "Shift 2",
  shift_3: "Shift 3",
};

export type ReportApproval = "not_required" | "pending" | "approved";

/** Rejected sheets never reach a report, so they have no label here. */
export const REPORT_APPROVAL_LABELS: Record<ReportApproval, string> = {
  not_required: "No approval",
  pending: "Pending",
  approved: "Approved",
};

export type ReportUtilisationBasis = "hourly" | "km" | "trip";

/** The unit a usage figure is in, by the equipment's utilisation basis. */
export const USAGE_UNITS: Record<ReportUtilisationBasis, string> = {
  hourly: "hrs",
  km: "km",
  trip: "trips",
};

export const HIRE_BASIS_LABELS: Record<string, string> = {
  hourly: "Hourly",
  daily: "Daily",
  monthly: "Monthly",
  trip: "Per trip",
};

export const FUEL_UNIT_LABELS: Record<string, string> = {
  barrel: "barrel",
  gallon: "gallon",
  kg: "kg",
  litre: "litre",
  unit: "unit",
};

export const MAINTENANCE_KIND_LABELS: Record<string, string> = {
  breakdown: "Breakdown",
  service: "Service",
  repair: "Repair",
  other: "Other",
};

/** Where equipment is when it is at no Project (CM-603). */
export const WAREHOUSE_PLACE = "Warehouse / off system";

/** A decimal string as a number: `"10.500"` → 10.5; null stays null. */
export function decimalOf(value: string | null): number | null {
  if (value == null || value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** A decimal string without trailing zeros: `"10.500"` → `"10.5"`. */
export function trimDecimal(value: string): string {
  if (!value.includes(".")) return value;
  return value.replace(/0+$/, "").replace(/\.$/, "");
}
