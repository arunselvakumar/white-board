import type { WingFloorInput } from "@/src/projects/domain/wing-floors";
import {
  nameKey,
  suggestUnitName,
  tidyName,
  wingLayout,
  type FloorKind,
  type GeneratedFloor,
  type WingType,
} from "@/src/projects/domain/wing-generator";

/**
 * The floor and unit editor's rows (CM-402). `key` is the row's identity
 * on screen; `id` is set for rows already stored, so Save on Edit Wing
 * keeps them.
 */
export type EditorUnit = { key: string; id?: string; name: string };

export type EditorFloor = {
  key: string;
  id?: string;
  kind: FloorKind;
  name: string;
  units: EditorUnit[];
};

let sequence = 0;

function nextKey(): string {
  sequence += 1;
  return `row-${String(sequence)}`;
}

/** Continue to Units: the generated floors as editor rows. */
export function editorFromGenerated(
  floors: readonly GeneratedFloor[],
): EditorFloor[] {
  return floors.map((floor) => ({
    key: nextKey(),
    kind: floor.kind,
    name: floor.name,
    units: floor.units.map((name) => ({ key: nextKey(), name })),
  }));
}

/** Edit Wing: the stored floors and units, with their ids. */
export function editorFromSaved(
  floors: readonly {
    id: string;
    kind: FloorKind;
    name: string;
    units: readonly { id: string; name: string }[];
  }[],
): EditorFloor[] {
  return floors.map((floor) => ({
    key: nextKey(),
    id: floor.id,
    kind: floor.kind,
    name: floor.name,
    units: floor.units.map((unit) => ({
      key: nextKey(),
      id: unit.id,
      name: unit.name,
    })),
  }));
}

/** A floor as Save sends it (a `WingFloorInput` the request model accepts). */
export type FloorInput = WingFloorInput & {
  units: { id?: string; name: string }[];
};

/** What Save sends: every floor top to bottom, ids where stored. */
export function toFloorInputs(floors: readonly EditorFloor[]): FloorInput[] {
  return floors.map((floor) => ({
    ...(floor.id == null ? {} : { id: floor.id }),
    kind: floor.kind,
    name: floor.name,
    units: floor.units.map((unit) => ({
      ...(unit.id == null ? {} : { id: unit.id }),
      name: unit.name,
    })),
  }));
}

export function unitNamesOf(floors: readonly EditorFloor[]): string[] {
  return floors.flatMap((floor) => floor.units.map((unit) => unit.name));
}

export function renameFloor(
  floors: readonly EditorFloor[],
  floorKey: string,
  name: string,
): EditorFloor[] {
  return floors.map((floor) =>
    floor.key === floorKey ? { ...floor, name: tidyName(name) } : floor,
  );
}

/** "+ Add": a unit named after the floor's last one, unique in the Wing. */
export function addUnit(
  floors: readonly EditorFloor[],
  floorKey: string,
): EditorFloor[] {
  const taken = unitNamesOf(floors);
  return floors.map((floor) =>
    floor.key === floorKey
      ? {
          ...floor,
          units: [
            ...floor.units,
            { key: nextKey(), name: suggestUnitName(floor, taken) },
          ],
        }
      : floor,
  );
}

export function renameUnit(
  floors: readonly EditorFloor[],
  unitKey: string,
  name: string,
): EditorFloor[] {
  return floors.map((floor) => ({
    ...floor,
    units: floor.units.map((unit) =>
      unit.key === unitKey ? { ...unit, name: tidyName(name) } : unit,
    ),
  }));
}

export function removeUnit(
  floors: readonly EditorFloor[],
  unitKey: string,
): EditorFloor[] {
  return floors.map((floor) => ({
    ...floor,
    units: floor.units.filter((unit) => unit.key !== unitKey),
  }));
}

/** A named floor (stilt, podium, mezzanine) at `index`, top to bottom. */
export function addNamedFloor(
  floors: readonly EditorFloor[],
  name: string,
  index: number,
): EditorFloor[] {
  const next = [...floors];
  next.splice(index, 0, {
    key: nextKey(),
    kind: "other",
    name: tidyName(name),
    units: [],
  });
  return next;
}

export function removeFloor(
  floors: readonly EditorFloor[],
  floorKey: string,
): EditorFloor[] {
  return floors.filter((floor) => floor.key !== floorKey);
}

/** Whether `name` is free in the Wing, ignoring `exceptKey`'s own name. */
export function unitNameFree(
  floors: readonly EditorFloor[],
  name: string,
  exceptKey?: string,
): boolean {
  const key = nameKey(name);
  return !floors.some((floor) =>
    floor.units.some(
      (unit) => unit.key !== exceptKey && nameKey(unit.name) === key,
    ),
  );
}

export function floorNameFree(
  floors: readonly EditorFloor[],
  name: string,
  exceptKey?: string,
): boolean {
  const key = nameKey(name);
  return !floors.some(
    (floor) => floor.key !== exceptKey && nameKey(floor.name) === key,
  );
}

/** Where Add Floor puts a named floor by default: just above Ground. */
export function defaultFloorIndex(floors: readonly EditorFloor[]): number {
  const ground = floors.findIndex((floor) => floor.kind === "ground");
  return ground >= 0 ? ground : floors.length;
}

function count(value: number, one: string, many: string): string {
  return `${value.toLocaleString("en-IN")} ${value === 1 ? one : many}`;
}

/**
 * "Floors 9 · Units 24"; a scheme counts only its plots or bungalows
 * ("Plots 24").
 */
export function editorTotals(
  type: WingType,
  floors: readonly { units: readonly unknown[] }[],
): string {
  const units = floors.reduce((sum, floor) => sum + floor.units.length, 0);
  if (wingLayout(type) === "scheme")
    return `${type === "plotting_scheme" ? "Plots" : "Bungalows"} ${units.toLocaleString("en-IN")}`;
  return `Floors ${floors.length.toLocaleString("en-IN")} · Units ${units.toLocaleString("en-IN")}`;
}

/** "3 floors · 24 units" for a Wing row; a scheme "24 plots". */
export function wingRowTotals(
  type: WingType,
  totals: { floors: number; units: number },
): string {
  if (wingLayout(type) === "scheme")
    return type === "plotting_scheme"
      ? count(totals.units, "plot", "plots")
      : count(totals.units, "bungalow", "bungalows");
  return `${count(totals.floors, "floor", "floors")} · ${count(totals.units, "unit", "units")}`;
}

export function structureTotals(totals: {
  wings: number;
  floors: number;
  units: number;
}): string {
  return [
    count(totals.wings, "Wing", "Wings"),
    count(totals.floors, "floor", "floors"),
    count(totals.units, "unit", "units"),
  ].join(" · ");
}
