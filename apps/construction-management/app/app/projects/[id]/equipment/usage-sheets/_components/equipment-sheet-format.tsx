import { Badge } from "@repo/ui/components/badge";

import { formatPaise } from "@/components/money/money-input";
import type { EquipmentSheet } from "@/src/queries/equipment-sheets";
import {
  FUEL_UNIT_LABELS,
  OWNERSHIP_LABELS,
  type EquipmentOwnership,
  type FuelUnit,
} from "@/src/site-work/domain/equipment";

import { trimDecimal } from "./equipment-sheet-live";

/** Words and badges the Equipment Usage screens share (CM-604). */

/** Company owned / Rented. */
export function OwnershipBadge({
  ownership,
}: {
  ownership: EquipmentOwnership;
}) {
  return (
    <Badge variant={ownership === "rented" ? "outline" : "secondary"}>
      {OWNERSHIP_LABELS[ownership]}
    </Badge>
  );
}

/** What the sheet measured: "8.5 h", "86.4 km" or "14 trips". */
export function usageText(sheet: {
  utilisationBasis: EquipmentSheet["utilisationBasis"];
  usageHours: string | null;
  distanceKm: string | null;
  trips: number | null;
}): string {
  switch (sheet.utilisationBasis) {
    case "hourly":
      return `${trimDecimal(sheet.usageHours ?? "0")} h`;
    case "km":
      return `${trimDecimal(sheet.distanceKm ?? "0")} km`;
    case "trip":
      return `${String(sheet.trips ?? 0)} ${sheet.trips === 1 ? "trip" : "trips"}`;
  }
}

/** "8.5 h", or a dash for zero. */
export function hoursText(value: string | null): string {
  if (value == null || Number(value) === 0) return "—";
  return `${trimDecimal(value)} h`;
}

/** "60 Litre". */
export function fuelText(qty: string | null, unit: FuelUnit | null): string {
  if (qty == null) return "—";
  return `${trimDecimal(qty)} ${unit == null ? "" : FUEL_UNIT_LABELS[unit]}`.trim();
}

/** ₹ from paise, or a dash. */
export function moneyText(paise: number | null): string {
  return paise == null ? "—" : formatPaise(paise);
}

/** The unit a billable quantity counts in. */
export function billableUnit(
  hireBasis: "hourly" | "daily" | "monthly" | "trip" | null,
): string {
  switch (hireBasis) {
    case "hourly":
      return "hours";
    case "trip":
      return "trips";
    case "daily":
    case "monthly":
      return "days";
    default:
      return "";
  }
}
