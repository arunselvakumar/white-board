import { Badge } from "@repo/ui/components/badge";

import { formatPaise } from "@/components/money/money-input";
import { formatDate } from "@/components/procurement/inventory/inventory-format";
import type { Equipment } from "@/src/queries/equipment";
import {
  EQUIPMENT_STATE_LABELS,
  FUEL_UNIT_LABELS,
  HIRE_BASIS_LABELS,
  OWNERSHIP_LABELS,
  TARGET_UNIT_LABELS,
  UTILISATION_BASIS_LABELS,
  WAREHOUSE_LABEL,
  WORKING_TIME_METHOD_LABELS,
  type EquipmentState,
} from "@/src/site-work/domain/equipment";

/** Where it is: "Tower A · Block C yard", or the warehouse. */
export function placeLabel(equipment: Equipment): string {
  const place =
    equipment.currentProject == null
      ? WAREHOUSE_LABEL
      : (equipment.currentProject.name ?? "A removed Project");
  const location = equipment.currentLocationName;
  return location == null || location === place
    ? place
    : `${place} · ${location}`;
}

/** "JCB 3DX · TN-09-AB-1234 · Company owned · Hourly". */
export function equipmentSummary(equipment: Equipment): string {
  return [
    equipment.equipmentNumber,
    OWNERSHIP_LABELS[equipment.ownership],
    `${UTILISATION_BASIS_LABELS[equipment.utilisationBasis]} · ${WORKING_TIME_METHOD_LABELS[equipment.workingTimeMethod]}`,
  ].join(" · ");
}

/** "₹1,200.00 / hour", or null without Financial. */
export function hireRateLabel(equipment: Equipment): string | null {
  if (equipment.hireRate == null || equipment.hireBasis == null) return null;
  const per = {
    hourly: "hour",
    daily: "day",
    monthly: "month",
    trip: "trip",
  }[equipment.hireBasis];
  return `${formatPaise(equipment.hireRate)} / ${per}`;
}

export function targetLabel(equipment: Equipment): string | null {
  if (equipment.targetValue == null || equipment.targetUnit == null)
    return null;
  return `${String(Number(equipment.targetValue))} ${TARGET_UNIT_LABELS[equipment.targetUnit]}`;
}

export function efficiencyLabel(equipment: Equipment): string | null {
  if (equipment.expectedFuelEfficiency == null) return null;
  const unit =
    equipment.fuelUnit == null ? "units" : FUEL_UNIT_LABELS[equipment.fuelUnit];
  const per = { hourly: "hr", km: "km", trip: "trip" }[
    equipment.utilisationBasis
  ];
  return `${String(Number(equipment.expectedFuelEfficiency))} ${unit}/${per}`;
}

export function hireBasisLabel(equipment: Equipment): string | null {
  return equipment.hireBasis == null
    ? null
    : HIRE_BASIS_LABELS[equipment.hireBasis];
}

/** Available / In maintenance / Unavailable. */
export function EquipmentStateBadge({ state }: { state: EquipmentState }) {
  return (
    <Badge
      variant={
        state === "available"
          ? "secondary"
          : state === "in_maintenance"
            ? "destructive"
            : "outline"
      }
    >
      {EQUIPMENT_STATE_LABELS[state]}
    </Badge>
  );
}

/** "Unavailable for worksheet entry — Since 4 Oct 2026". */
export function unavailableBanner(since: string): string {
  return `Unavailable for worksheet entry — Since ${formatDate(since)}`;
}
