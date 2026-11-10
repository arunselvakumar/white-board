"use client";

import { Button } from "@repo/ui/components/button";
import { cn } from "@repo/ui/lib/utils";

import {
  wingLayout,
  type WingType,
} from "@/src/projects/domain/wing-generator";
import {
  UNIT_SALES_STATUS_LABELS,
  type UnitSalesStatus,
} from "@/src/sales/domain/sales-terms";

import { UNIT_STATUS_CLASSES } from "./sales-status";

export type ChartUnit = {
  id: string;
  name: string;
  status: UnitSalesStatus;
  unitType: string | null;
};

export type ChartFloor = {
  id: string;
  name: string;
  units: readonly ChartUnit[];
};

function UnitCell({
  unit,
  selected,
  onSelect,
}: {
  unit: ChartUnit;
  selected: boolean;
  onSelect: (unitId: string) => void;
}) {
  const label = [
    unit.name,
    UNIT_SALES_STATUS_LABELS[unit.status],
    unit.unitType,
  ]
    .filter((part) => part != null)
    .join(", ");
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-label={label}
      aria-pressed={selected}
      title={label}
      className={cn(
        "h-10 min-w-16 flex-col gap-0 px-2 py-1 text-sm leading-tight font-medium whitespace-nowrap tabular-nums",
        UNIT_STATUS_CLASSES[unit.status],
        selected && "ring-ring ring-2 ring-offset-1",
      )}
      onClick={() => {
        onSelect(unit.id);
      }}
    >
      <span>{unit.name}</span>
      {unit.unitType != null && (
        <span className="max-w-20 truncate text-[10px] font-normal opacity-80">
          {unit.unitType}
        </span>
      )}
    </Button>
  );
}

/**
 * The Units chart (CM-1005): the Wing chart of CM-402 (floors top to
 * bottom, units across; a scheme's plots wrap) with each unit coloured by
 * its sales status and named by it. A tall or wide Wing scrolls inside its
 * own frame, never the page; the floor names stay in view. Selecting a
 * unit opens its panel.
 */
export function SalesUnitsChart({
  name,
  type,
  floors,
  selectedId,
  onSelect,
}: {
  name: string;
  type: WingType;
  floors: readonly ChartFloor[];
  selectedId: string | null;
  onSelect: (unitId: string) => void;
}) {
  if (wingLayout(type) === "scheme") {
    const units = floors.flatMap((floor) => floor.units);
    return (
      <ul
        aria-label={`${name} units`}
        className="bg-card flex flex-wrap gap-2 rounded-xl border p-3"
      >
        {units.map((unit) => (
          <li key={unit.id}>
            <UnitCell
              unit={unit}
              selected={unit.id === selectedId}
              onSelect={onSelect}
            />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div
      role="region"
      aria-label={`${name} units`}
      tabIndex={0}
      className="bg-card focus-visible:ring-ring/50 max-h-[70vh] w-full overflow-auto rounded-xl border outline-none focus-visible:ring-3"
    >
      <table className="border-separate border-spacing-0 text-sm">
        <tbody>
          {floors.map((floor) => (
            <tr key={floor.id}>
              <th
                scope="row"
                className="bg-card sticky left-0 z-10 max-w-28 truncate border-r border-b px-3 py-2 text-left font-medium whitespace-nowrap sm:max-w-48"
              >
                {floor.name}
              </th>
              {floor.units.length === 0 ? (
                <td className="text-muted-foreground border-b px-3 py-2 whitespace-nowrap">
                  No units
                </td>
              ) : (
                floor.units.map((unit) => (
                  <td key={unit.id} className="border-b p-1">
                    <UnitCell
                      unit={unit}
                      selected={unit.id === selectedId}
                      onSelect={onSelect}
                    />
                  </td>
                ))
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
