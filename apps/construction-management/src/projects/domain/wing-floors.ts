import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  WING_FLOOR_NAME_MAX,
  WING_FLOOR_ROWS_MAX,
  WING_UNIT_NAME_MAX,
  WING_UNITS_MAX,
  nameKey,
  tidyName,
  wingLayout,
  type FloorKind,
  type WingType,
} from "./wing-generator";

/**
 * The floors and units the editor saves (ADR CM-0013 §3), checked the same
 * way in the browser and on the server. Pure and free of server imports.
 */

/** A unit as the editor sends it; `id` for a unit that is already stored. */
export type WingUnitInput = { id?: string | null; name: string };

/** A floor as the editor sends it, top to bottom; `id` for a stored floor. */
export type WingFloorInput = {
  id?: string | null;
  kind: FloorKind;
  name: string;
  units: readonly WingUnitInput[];
};

export type CleanWingUnit = {
  id: string | null;
  name: string;
  position: number;
};

export type CleanWingFloor = {
  id: string | null;
  kind: FloorKind;
  name: string;
  /** Ground 0, floors above it 1, 2 …, basements −1, −2 …. */
  level: number;
  units: CleanWingUnit[];
};

type Where = { floorIndex: number; unitIndex?: number };

function invalid(code: string, message: string, where?: Where): DomainError {
  return new DomainError(
    code,
    message,
    where == null ? {} : { details: where },
  );
}

/** Top-to-bottom rank of the kinds whose place is fixed; `other` goes anywhere. */
const RANK: Partial<Record<FloorKind, number>> = {
  terrace: 0,
  typed: 1,
  ground: 2,
  basement: 3,
};

function checkKinds(type: WingType, kinds: readonly FloorKind[]): void {
  if (wingLayout(type) === "scheme") {
    if (kinds.length !== 1 || kinds[0] !== "site")
      throw invalid(
        "WING_FLOORS_INVALID",
        "A scheme keeps its plots or bungalows in one row.",
      );
    return;
  }
  const siteAt = kinds.indexOf("site");
  if (siteAt >= 0)
    throw invalid(
      "WING_FLOORS_INVALID",
      "Only a bungalow or plotting scheme has a row of plots.",
      { floorIndex: siteAt },
    );
  for (const once of ["terrace", "ground"] as const) {
    const at = kinds.indexOf(once);
    if (at >= 0 && kinds.includes(once, at + 1))
      throw invalid(
        "WING_FLOORS_INVALID",
        once === "terrace"
          ? "A Wing has one Terrace Floor."
          : "A Wing has one Ground Floor.",
        { floorIndex: kinds.indexOf(once, at + 1) },
      );
  }
  let highest = -1;
  for (const [index, kind] of kinds.entries()) {
    const rank = RANK[kind];
    if (rank == null) continue;
    if (rank < highest)
      throw invalid(
        "WING_FLOOR_ORDER_INVALID",
        "Floors go Terrace, upper floors, Ground, then basements, top to bottom.",
        { floorIndex: index },
      );
    highest = rank;
  }
}

/**
 * Levels top to bottom: Ground is 0 with the floors above it counting up
 * and the floors below it counting down. Without a Ground, the floors above
 * the first basement end at 1; a scheme's one row is 0.
 */
export function floorLevels(kinds: readonly FloorKind[]): number[] {
  if (kinds.length === 1 && kinds[0] === "site") return [0];
  const ground = kinds.indexOf("ground");
  if (ground >= 0) return kinds.map((_, index) => ground - index);
  const basement = kinds.indexOf("basement");
  if (basement >= 0)
    return kinds.map((_, index) =>
      index < basement ? basement - index : basement - index - 1,
    );
  return kinds.map((_, index) => kinds.length - index);
}

/**
 * Checks a Wing's floors and units before Save: at least one floor and at
 * most 200; floor names required (≤ 60) and unit names required (≤ 30),
 * spaces tidied, each unique in the Wing ignoring case; at most 5,000
 * units; kinds in a sensible order (a scheme has exactly its one row). 400
 * with `details.floorIndex` (and `unitIndex`) naming the row.
 */
export function cleanWingFloors(
  type: WingType,
  floors: readonly WingFloorInput[],
): CleanWingFloor[] {
  if (floors.length === 0)
    throw invalid("WING_FLOORS_REQUIRED", "A Wing needs at least one floor.");
  if (floors.length > WING_FLOOR_ROWS_MAX)
    throw invalid(
      "WING_TOO_MANY_FLOORS",
      `A Wing holds at most ${String(WING_FLOOR_ROWS_MAX)} floors.`,
    );
  const units = floors.reduce((sum, floor) => sum + floor.units.length, 0);
  if (units > WING_UNITS_MAX)
    throw invalid(
      "WING_TOO_MANY_UNITS",
      `A Wing holds at most ${WING_UNITS_MAX.toLocaleString("en-IN")} units.`,
    );
  checkKinds(
    type,
    floors.map((floor) => floor.kind),
  );
  const levels = floorLevels(floors.map((floor) => floor.kind));

  const floorNames = new Map<string, number>();
  const unitNames = new Map<string, Where>();
  return floors.map((floor, floorIndex) => {
    const name = tidyName(floor.name);
    if (name.length === 0)
      throw invalid("WING_FLOOR_NAME_REQUIRED", "Enter the floor name.", {
        floorIndex,
      });
    if (name.length > WING_FLOOR_NAME_MAX)
      throw invalid(
        "WING_FLOOR_NAME_TOO_LONG",
        `Floor names are at most ${String(WING_FLOOR_NAME_MAX)} characters.`,
        { floorIndex },
      );
    const floorKey = nameKey(name);
    if (floorNames.has(floorKey))
      throw invalid(
        "WING_FLOOR_NAME_DUPLICATE",
        `Two floors are called "${name}". Give each floor its own name.`,
        { floorIndex },
      );
    floorNames.set(floorKey, floorIndex);

    return {
      id: floor.id ?? null,
      kind: floor.kind,
      name,
      level: levels[floorIndex] ?? 0,
      units: floor.units.map((unit, unitIndex) => {
        const unitName = tidyName(unit.name);
        const where = { floorIndex, unitIndex };
        if (unitName.length === 0)
          throw invalid(
            "WING_UNIT_NAME_REQUIRED",
            "Enter the unit name.",
            where,
          );
        if (unitName.length > WING_UNIT_NAME_MAX)
          throw invalid(
            "WING_UNIT_NAME_TOO_LONG",
            `Unit names are at most ${String(WING_UNIT_NAME_MAX)} characters.`,
            where,
          );
        const unitKey = nameKey(unitName);
        if (unitNames.has(unitKey))
          throw invalid(
            "WING_UNIT_NAME_DUPLICATE",
            `Two units are called "${unitName}". Unit names are unique in a Wing.`,
            where,
          );
        unitNames.set(unitKey, where);
        return { id: unit.id ?? null, name: unitName, position: unitIndex };
      }),
    };
  });
}
