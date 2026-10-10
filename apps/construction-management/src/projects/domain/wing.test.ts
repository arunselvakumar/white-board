import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import { Location, locationDetails } from "./location";
import { Phase, nextPhaseName, phaseName } from "./phase";
import { Wing } from "./wing";
import {
  cleanWingFloors,
  floorLevels,
  type WingFloorInput,
} from "./wing-floors";
import { generateWingFloors, wingConfig } from "./wing-generator";

const NOW = new Date("2026-10-10T10:00:00Z");
const LATER = new Date("2026-10-10T11:00:00Z");

function ids() {
  let next = 0;
  return () => `id-${String((next += 1))}`;
}

function codeOf(run: () => unknown): { code: string; details: unknown } {
  try {
    run();
  } catch (error) {
    if (error instanceof DomainError)
      return { code: error.code, details: error.details };
    throw error;
  }
  throw new Error("Expected a DomainError");
}

const CONFIG = { floors: 2, startNumber: 1, unitsPerFloor: 2, basements: 1 };

function editorFloors(): WingFloorInput[] {
  return generateWingFloors("commercial", wingConfig("commercial", CONFIG)).map(
    (floor) => ({
      kind: floor.kind,
      name: floor.name,
      units: floor.units.map((name) => ({ name })),
    }),
  );
}

function newWing(floors = editorFloors()): Wing {
  return Wing.create({
    id: "wing-a",
    workspaceId: "ws",
    projectId: "p",
    phaseId: "phase-1",
    position: 0,
    type: "commercial",
    name: "  Wing   A ",
    config: CONFIG,
    floors,
    by: "u1",
    now: NOW,
    newId: ids(),
  });
}

/** What the editor sends back for a stored Wing: every row with its id. */
function asSaved(wing: Wing): WingFloorInput[] {
  return wing.floors.map((floor) => ({
    id: floor.id,
    kind: floor.kind,
    name: floor.name,
    units: floor.units.map((unit) => ({ id: unit.id, name: unit.name })),
  }));
}

describe("Wing floors (CM-402)", () => {
  it("levels: Ground 0, up from it, basements below", () => {
    expect(
      floorLevels([
        "terrace",
        "typed",
        "typed",
        "ground",
        "basement",
        "basement",
      ]),
    ).toEqual([3, 2, 1, 0, -1, -2]);
    expect(floorLevels(["site"])).toEqual([0]);
    expect(floorLevels(["typed", "other", "basement"])).toEqual([2, 1, -1]);
    expect(floorLevels(["other", "typed"])).toEqual([2, 1]);
  });

  it("tidies names and puts units in order", () => {
    const floors = cleanWingFloors("commercial", [
      {
        kind: "typed",
        name: " Commercial  Floor 1 ",
        units: [{ name: " 101 " }, { name: "Shop  A" }],
      },
      { kind: "other", name: "Stilt", units: [] },
      { kind: "ground", name: "Ground Floor", units: [] },
    ]);
    expect(floors).toEqual([
      {
        id: null,
        kind: "typed",
        name: "Commercial Floor 1",
        level: 2,
        units: [
          { id: null, name: "101", position: 0 },
          { id: null, name: "Shop A", position: 1 },
        ],
      },
      { id: null, kind: "other", name: "Stilt", level: 1, units: [] },
      { id: null, kind: "ground", name: "Ground Floor", level: 0, units: [] },
    ]);
  });

  it("refuses duplicate unit and floor names ignoring case, naming the row", () => {
    expect(
      codeOf(() =>
        cleanWingFloors("commercial", [
          { kind: "typed", name: "Floor 1", units: [{ name: "101" }] },
          {
            kind: "ground",
            name: "Ground",
            units: [{ name: "g01" }, { name: "101" }],
          },
        ]),
      ),
    ).toEqual({
      code: "WING_UNIT_NAME_DUPLICATE",
      details: { floorIndex: 1, unitIndex: 1 },
    });
    expect(
      codeOf(() =>
        cleanWingFloors("commercial", [
          { kind: "other", name: "Stilt", units: [] },
          { kind: "other", name: "STILT", units: [] },
        ]),
      ),
    ).toEqual({
      code: "WING_FLOOR_NAME_DUPLICATE",
      details: { floorIndex: 1 },
    });
  });

  it("refuses empty and long names, no floors and too many units", () => {
    expect(
      codeOf(() =>
        cleanWingFloors("commercial", [
          { kind: "ground", name: " ", units: [] },
        ]),
      ).code,
    ).toBe("WING_FLOOR_NAME_REQUIRED");
    expect(
      codeOf(() =>
        cleanWingFloors("commercial", [
          { kind: "ground", name: "G", units: [{ name: "x".repeat(31) }] },
        ]),
      ),
    ).toEqual({
      code: "WING_UNIT_NAME_TOO_LONG",
      details: { floorIndex: 0, unitIndex: 0 },
    });
    expect(
      codeOf(() =>
        cleanWingFloors("commercial", [
          { kind: "ground", name: "G", units: [{ name: "" }] },
        ]),
      ).code,
    ).toBe("WING_UNIT_NAME_REQUIRED");
    expect(codeOf(() => cleanWingFloors("commercial", [])).code).toBe(
      "WING_FLOORS_REQUIRED",
    );
    const many = Array.from({ length: 5001 }, (_, index) => ({
      name: `U${String(index)}`,
    }));
    expect(
      codeOf(() =>
        cleanWingFloors("plotting_scheme", [
          { kind: "site", name: "Plots", units: many },
        ]),
      ).code,
    ).toBe("WING_TOO_MANY_UNITS");
  });

  it("keeps kinds consistent with the Wing Type", () => {
    expect(
      codeOf(() =>
        cleanWingFloors("commercial", [
          { kind: "ground", name: "Ground", units: [] },
          { kind: "typed", name: "Floor 1", units: [] },
        ]),
      ),
    ).toEqual({ code: "WING_FLOOR_ORDER_INVALID", details: { floorIndex: 1 } });
    expect(
      codeOf(() =>
        cleanWingFloors("commercial", [
          { kind: "terrace", name: "Terrace", units: [] },
          { kind: "terrace", name: "Terrace 2", units: [] },
        ]),
      ).code,
    ).toBe("WING_FLOORS_INVALID");
    expect(
      codeOf(() =>
        cleanWingFloors("commercial", [
          { kind: "site", name: "Plots", units: [] },
        ]),
      ).code,
    ).toBe("WING_FLOORS_INVALID");
    expect(
      codeOf(() =>
        cleanWingFloors("plotting_scheme", [
          { kind: "site", name: "Plots", units: [] },
          { kind: "other", name: "More", units: [] },
        ]),
      ).code,
    ).toBe("WING_FLOORS_INVALID");
    // A named floor may go anywhere, also below the basements.
    expect(() =>
      cleanWingFloors("commercial", [
        { kind: "other", name: "Podium", units: [] },
        { kind: "typed", name: "Floor 1", units: [] },
        { kind: "ground", name: "Ground", units: [] },
        { kind: "basement", name: "Basement 1", units: [] },
        { kind: "other", name: "Sump", units: [] },
      ]),
    ).not.toThrow();
  });
});

describe("Wing (CM-402)", () => {
  it("is created from configuration plus the edited floors, with new ids", () => {
    const wing = newWing();
    expect(wing.name).toBe("Wing A");
    expect(wing.config).toEqual({ ...CONFIG, terrace: true });
    expect(wing.totals).toEqual({ floors: 5, units: 6 });
    expect(wing.floors.map((floor) => [floor.name, floor.level])).toEqual([
      ["Terrace Floor", 3],
      ["Commercial Floor 2", 2],
      ["Commercial Floor 1", 1],
      ["Ground Floor", 0],
      ["Basement Floor 1", -1],
    ]);
    const allIds = wing.floors.flatMap((floor) => [
      floor.id,
      ...floor.units.map((unit) => unit.id),
    ]);
    expect(new Set(allIds).size).toBe(11);
  });

  it("refuses ids, a bad type and a bad name on create", () => {
    const floors = editorFloors();
    floors[0] = { ...floors[0]!, id: "x" };
    expect(codeOf(() => newWing(floors)).code).toBe("WING_FLOOR_NOT_FOUND");
    expect(
      codeOf(() =>
        Wing.create({
          id: "w",
          workspaceId: "ws",
          projectId: "p",
          phaseId: "ph",
          position: 0,
          type: "tower",
          name: "A",
          config: CONFIG,
          floors: editorFloors(),
          by: "u",
          now: NOW,
          newId: ids(),
        }),
      ).code,
    ).toBe("WING_TYPE_INVALID");
    expect(
      codeOf(() =>
        Wing.create({
          id: "w",
          workspaceId: "ws",
          projectId: "p",
          phaseId: "ph",
          position: 0,
          type: "commercial",
          name: "  ",
          config: CONFIG,
          floors: editorFloors(),
          by: "u",
          now: NOW,
          newId: ids(),
        }),
      ).code,
    ).toBe("WING_NAME_REQUIRED");
  });

  it("an edit keeps ids, creates rows without ids and returns the rows left out", () => {
    const wing = newWing();
    const floors = asSaved(wing);
    const ground = floors[3]!;
    const firstUnit = floors[2]!.units[0]!;
    // Rename a unit, remove a unit, add a unit, rename a floor, add a floor.
    floors[2] = {
      ...floors[2]!,
      name: "Shops Floor",
      units: [{ ...firstUnit, name: "Shop 1" }],
    };
    floors[3] = { ...ground, units: [...ground.units, { name: "G03" }] };
    floors.splice(4, 0, { kind: "other", name: "Stilt Floor", units: [] });
    const removedUnit = wing.floors[2]!.units[1]!.id;

    const removals = wing.update({
      name: "Wing A",
      phaseId: "phase-1",
      position: 0,
      floors,
      by: "u2",
      now: LATER,
      newId: ids(),
    });
    expect(removals).toEqual({ floorIds: [], unitIds: [removedUnit] });
    expect(wing.floors[2]?.name).toBe("Shops Floor");
    expect(wing.floors[2]?.units).toEqual([
      { id: firstUnit.id, name: "Shop 1", position: 0 },
    ]);
    expect(wing.floors[3]?.units.map((unit) => unit.name)).toEqual([
      "G01",
      "G02",
      "G03",
    ]);
    expect(wing.floors[4]).toMatchObject({
      kind: "other",
      name: "Stilt Floor",
      level: -1,
    });
    expect(wing.floors[5]).toMatchObject({
      name: "Basement Floor 1",
      level: -2,
    });
    expect(wing.updatedAt).toBe(LATER);
    expect(wing.updatedBy).toBe("u2");
  });

  it("a removed floor takes its units with it; kinds stay as stored", () => {
    const wing = newWing();
    const floors = asSaved(wing);
    const top = floors[1]!;
    const removals = wing.update({
      name: "Wing A",
      phaseId: "phase-2",
      position: 3,
      // The client says "ground" for the terrace: the stored kind wins.
      floors: [{ ...floors[0]!, kind: "ground" }, ...floors.slice(2)],
      by: "u2",
      now: LATER,
      newId: ids(),
    });
    expect(removals.floorIds).toEqual([top.id]);
    expect(removals.unitIds).toEqual(top.units.map((unit) => unit.id));
    expect(wing.floors[0]?.kind).toBe("terrace");
    expect(wing.phaseId).toBe("phase-2");
    expect(wing.position).toBe(3);
  });

  it("refuses an id that is not on the Wing, or sent twice", () => {
    const wing = newWing();
    const floors = asSaved(wing);
    expect(
      codeOf(() =>
        wing.update({
          name: "A",
          phaseId: "p",
          position: 0,
          floors: [...floors, { ...floors[0]!, name: "Again" }],
          by: "u",
          now: LATER,
          newId: ids(),
        }),
      ),
    ).toEqual({ code: "WING_FLOOR_NOT_FOUND", details: { floorIndex: 5 } });
    const other = newWing();
    const stranger = other.floors[1]!.units[0]!.id;
    const withStranger = asSaved(wing);
    withStranger[1] = {
      ...withStranger[1]!,
      units: [{ id: `${stranger}-x`, name: "999" }],
    };
    expect(
      codeOf(() =>
        wing.update({
          name: "A",
          phaseId: "p",
          position: 0,
          floors: withStranger,
          by: "u",
          now: LATER,
          newId: ids(),
        }),
      ),
    ).toEqual({
      code: "WING_UNIT_NOT_FOUND",
      details: { floorIndex: 1, unitIndex: 0 },
    });
  });

  it("is deleted once", () => {
    const wing = newWing();
    wing.delete("u", LATER);
    expect(wing.deletedAt).toBe(LATER);
    expect(codeOf(() => wing.delete("u", LATER)).code).toBe("WING_NOT_FOUND");
  });
});

describe("Phase (CM-402)", () => {
  it("cleans the name and suggests the next one", () => {
    expect(phaseName("  Phase   2 ")).toBe("Phase 2");
    expect(codeOf(() => phaseName("")).code).toBe("PHASE_NAME_REQUIRED");
    expect(codeOf(() => phaseName("x".repeat(61))).code).toBe(
      "PHASE_NAME_TOO_LONG",
    );
    expect(nextPhaseName([])).toBe("Phase 1");
    expect(nextPhaseName(["Phase 1"])).toBe("Phase 2");
    expect(nextPhaseName(["Phase 1", "Phase 3"])).toBe("Phase 4");
    expect(nextPhaseName(["Tower block"])).toBe("Phase 2");
  });

  it("renames and deletes", () => {
    const phase = Phase.create({
      id: "ph",
      workspaceId: "ws",
      projectId: "p",
      name: "Phase 1",
      position: 0,
      by: "u",
      now: NOW,
    });
    phase.rename("Stage A", "u2", LATER);
    expect(phase.name).toBe("Stage A");
    expect(phase.updatedAt).toBe(LATER);
    phase.delete("u2", LATER);
    expect(codeOf(() => phase.delete("u2", LATER)).code).toBe(
      "PHASE_NOT_FOUND",
    );
  });
});

describe("Location (CM-405)", () => {
  it("name ≤ 80 required, description ≤ 300 optional", () => {
    expect(
      locationDetails({ name: " Chainage  0+000 – 2+500 ", description: "  " }),
    ).toEqual({ name: "Chainage 0+000 – 2+500", description: null });
    expect(codeOf(() => locationDetails({ name: "" })).code).toBe(
      "LOCATION_NAME_REQUIRED",
    );
    expect(codeOf(() => locationDetails({ name: "x".repeat(81) })).code).toBe(
      "LOCATION_NAME_TOO_LONG",
    );
    expect(
      codeOf(() =>
        locationDetails({ name: "C3", description: "x".repeat(301) }),
      ).code,
    ).toBe("LOCATION_DESCRIPTION_TOO_LONG");
    expect(() =>
      locationDetails({ name: "x".repeat(80), description: "x".repeat(300) }),
    ).not.toThrow();
  });

  it("updates, moves and deletes", () => {
    const location = Location.create({
      id: "l",
      workspaceId: "ws",
      projectId: "p",
      details: { name: "Culvert C3", description: "Box culvert" },
      position: 2,
      by: "u",
      now: NOW,
    });
    location.update({ name: "Culvert C4" }, "u2", LATER);
    expect(location.details).toEqual({ name: "Culvert C4", description: null });
    location.moveTo(1, "u2", LATER);
    expect(location.position).toBe(1);
    location.delete("u2", LATER);
    expect(codeOf(() => location.delete("u2", LATER)).code).toBe(
      "LOCATION_NOT_FOUND",
    );
  });
});
