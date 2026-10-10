import { describe, expect, it } from "vitest";

import type { AuditEvent } from "@/src/shared-kernel/audit";
import { DomainError } from "@/src/shared-kernel/domain-error";

import type { Location } from "../domain/location";
import type { Phase } from "../domain/phase";
import type { Project } from "../domain/project";
import type {
  LocationRepository,
  PhaseRepository,
  StructureUsage,
  WingRepository,
} from "../domain/structure-repository";
import { Wing } from "../domain/wing";
import { generateWingFloors, wingConfig } from "../domain/wing-generator";
import { LocationHandlers } from "./location-handlers";
import type { ProjectViewer } from "./project-handlers";
import type { ProjectStructureReader } from "./structure-read-model";
import { WingHandlers } from "./wing-handlers";

/** The item at `index`; a test fails loudly when it is missing. */
function nth<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`No item ${String(index)}`);
  return item;
}

const OWNER: ProjectViewer = {
  workspaceId: "ws",
  userId: "owner",
  role: "owner",
  projectIds: new Set(),
};

const PROJECT_ID = "project-1";

const projects = {
  findById: (workspaceId: string, id: string) =>
    Promise.resolve(
      workspaceId === "ws" && id === PROJECT_ID ? ({} as Project) : null,
    ),
};

class MemoryPhases implements PhaseRepository {
  readonly rows: Phase[] = [];
  list() {
    return Promise.resolve(this.rows.filter((row) => row.deletedAt == null));
  }
  find(_: string, __: string, id: string) {
    return Promise.resolve(
      this.rows.find((row) => row.id === id && row.deletedAt == null) ?? null,
    );
  }
  insert(phase: Phase) {
    this.rows.push(phase);
    return Promise.resolve();
  }
  update() {
    return Promise.resolve();
  }
  delete() {
    return Promise.resolve();
  }
}

/** A fresh aggregate per load, as the database gives one. */
function copy(wing: Wing): Wing {
  return Wing.reconstitute({
    id: wing.id,
    workspaceId: wing.workspaceId,
    projectId: wing.projectId,
    phaseId: wing.phaseId,
    type: wing.type,
    name: wing.name,
    config: wing.config,
    position: wing.position,
    floors: wing.floors.map((floor) => ({
      ...floor,
      units: floor.units.map((unit) => ({ ...unit })),
    })),
    createdAt: wing.createdAt,
    updatedAt: wing.updatedAt,
    createdBy: wing.createdBy,
    updatedBy: wing.updatedBy,
    deletedAt: wing.deletedAt,
  });
}

class MemoryWings implements WingRepository {
  readonly rows: Wing[] = [];
  readonly audits: AuditEvent[] = [];
  find(_: string, __: string, id: string) {
    const found = this.rows.find(
      (row) => row.id === id && row.deletedAt == null,
    );
    return Promise.resolve(found == null ? null : copy(found));
  }
  nextPosition() {
    return Promise.resolve(this.rows.length);
  }
  insert(wing: Wing, audit: AuditEvent, phase?: { phase: Phase }) {
    if (phase != null) phases.rows.push(phase.phase);
    this.rows.push(wing);
    this.audits.push(audit);
    return Promise.resolve();
  }
  update(_: Wing, __: Date, ___: unknown, audit: AuditEvent) {
    this.audits.push(audit);
    return Promise.resolve();
  }
  delete(_: Wing, audit: AuditEvent) {
    this.audits.push(audit);
    return Promise.resolve();
  }
}

class MemoryLocations implements LocationRepository {
  readonly rows: Location[] = [];
  list() {
    return Promise.resolve(
      this.rows
        .filter((row) => row.deletedAt == null)
        .sort((a, b) => a.position - b.position),
    );
  }
  find(_: string, __: string, id: string) {
    return Promise.resolve(this.rows.find((row) => row.id === id) ?? null);
  }
  insert(location: Location) {
    this.rows.push(location);
    return Promise.resolve();
  }
  update() {
    return Promise.resolve();
  }
  swap() {
    return Promise.resolve();
  }
  delete() {
    return Promise.resolve();
  }
}

/** Answers "used" for whatever the test names. */
class FakeUsage implements StructureUsage {
  units = new Set<string>();
  floors = new Set<string>();
  wings = new Set<string>();
  locations = new Set<string>();
  usedFloorsAndUnits(
    _: string,
    ids: { floorIds: readonly string[]; unitIds: readonly string[] },
  ) {
    return Promise.resolve({
      floorIds: ids.floorIds.filter((id) => this.floors.has(id)),
      unitIds: ids.unitIds.filter((id) => this.units.has(id)),
    });
  }
  isWingUsed(_: string, id: string) {
    return Promise.resolve(this.wings.has(id));
  }
  isLocationUsed(_: string, id: string) {
    return Promise.resolve(this.locations.has(id));
  }
}

const reader: ProjectStructureReader = {
  phases: () => Promise.resolve([]),
  wingSummaries: () => Promise.resolve([]),
  wings: () => Promise.resolve([]),
  wing: () => Promise.resolve(null),
  locations: () => Promise.resolve([]),
};

let phases: MemoryPhases;

function setup() {
  phases = new MemoryPhases();
  const wings = new MemoryWings();
  const usage = new FakeUsage();
  const handlers = new WingHandlers(projects, phases, wings, reader, usage);
  return { wings, usage, handlers };
}

function floors() {
  return generateWingFloors(
    "commercial",
    wingConfig("commercial", { floors: 1, startNumber: 1, unitsPerFloor: 2 }),
  ).map((floor) => ({
    kind: floor.kind,
    name: floor.name,
    units: floor.units.map((name) => ({ name })),
  }));
}

async function codeOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  throw new Error("Expected a DomainError");
}

describe("WingHandlers (CM-402)", () => {
  it("gives a Project its Phase 1 with the first Wing, then uses the first Phase", async () => {
    const { handlers, wings } = setup();
    const first = await handlers.create({
      viewer: OWNER,
      projectId: PROJECT_ID,
      type: "commercial",
      name: "A",
      config: { floors: 1, startNumber: 1, unitsPerFloor: 2 },
      floors: floors(),
      by: "owner",
    });
    expect(phases.rows.map((phase) => phase.name)).toEqual(["Phase 1"]);
    expect(first.phaseId).toBe(phases.rows[0]?.id);
    const second = await handlers.create({
      viewer: OWNER,
      projectId: PROJECT_ID,
      type: "commercial",
      name: "B",
      config: { floors: 1, startNumber: 1, unitsPerFloor: 2 },
      floors: floors(),
      by: "owner",
    });
    expect(phases.rows).toHaveLength(1);
    expect(second.phaseId).toBe(first.phaseId);
    expect(wings.audits.map((audit) => audit.action)).toEqual([
      "wing.created",
      "wing.created",
    ]);
  });

  it("refuses a Phase of another Project and a Project the viewer cannot see", async () => {
    const { handlers } = setup();
    const input = {
      viewer: OWNER,
      projectId: PROJECT_ID,
      type: "commercial",
      name: "A",
      config: { floors: 1, startNumber: 1, unitsPerFloor: 2 },
      floors: floors(),
      by: "owner",
    };
    expect(
      await codeOf(() => handlers.create({ ...input, phaseId: "nope" })),
    ).toBe("WING_PHASE_INVALID");
    expect(
      await codeOf(() =>
        handlers.create({
          ...input,
          viewer: { ...OWNER, role: "member", projectIds: new Set() },
        }),
      ),
    ).toBe("PROJECT_NOT_FOUND");
  });

  it("asks StructureUsage before removing units, floors or the Wing", async () => {
    const { handlers, usage } = setup();
    const wing = await handlers.create({
      viewer: OWNER,
      projectId: PROJECT_ID,
      type: "commercial",
      name: "A",
      config: { floors: 1, startNumber: 1, unitsPerFloor: 2 },
      floors: floors(),
      by: "owner",
    });
    const saved = wing.floors.map((floor) => ({
      id: floor.id,
      kind: floor.kind,
      name: floor.name,
      units: floor.units.map((unit) => ({ id: unit.id, name: unit.name })),
    }));
    const typed = nth(saved, 1);
    usage.units.add(nth(typed.units, 1).id);
    const edit = {
      viewer: OWNER,
      projectId: PROJECT_ID,
      wingId: wing.id,
      name: "A",
      expectedUpdatedAt: wing.updatedAt,
      by: "owner",
    };
    try {
      await handlers.update({
        ...edit,
        floors: [
          nth(saved, 0),
          { ...typed, units: [nth(typed.units, 0)] },
          nth(saved, 2),
        ],
      });
      throw new Error("Expected UNIT_IN_USE");
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("UNIT_IN_USE");
      expect((error as DomainError).details).toMatchObject({ names: ["102"] });
    }
    usage.units.clear();
    usage.floors.add(nth(saved, 0).id);
    expect(
      await codeOf(() => handlers.update({ ...edit, floors: saved.slice(1) })),
    ).toBe("FLOOR_IN_USE");
    usage.wings.add(wing.id);
    expect(
      await codeOf(() =>
        handlers.delete({
          viewer: OWNER,
          projectId: PROJECT_ID,
          wingId: wing.id,
          by: "owner",
        }),
      ),
    ).toBe("WING_IN_USE");
  });

  it("answers WING_CHANGED before anything else on a stale updatedAt", async () => {
    const { handlers } = setup();
    const wing = await handlers.create({
      viewer: OWNER,
      projectId: PROJECT_ID,
      type: "plotting_scheme",
      name: "Plots",
      config: { units: 2 },
      floors: [
        {
          kind: "site",
          name: "Plots",
          units: [{ name: "Plot 1" }, { name: "Plot 2" }],
        },
      ],
      by: "owner",
    });
    expect(
      await codeOf(() =>
        handlers.update({
          viewer: OWNER,
          projectId: PROJECT_ID,
          wingId: wing.id,
          name: "Plots",
          floors: [],
          expectedUpdatedAt: new Date(0),
          by: "owner",
        }),
      ),
    ).toBe("WING_CHANGED");
  });
});

describe("LocationHandlers (CM-405)", () => {
  it("adds at the end, moves by swapping and refuses deleting a used Location", async () => {
    const store = new MemoryLocations();
    const usage = new FakeUsage();
    const handlers = new LocationHandlers(projects, store, reader, usage);
    const add = (name: string) =>
      handlers.create({
        viewer: OWNER,
        projectId: PROJECT_ID,
        details: { name },
        by: "owner",
      });
    const a = await add("Chainage 0+000");
    const b = await add("Culvert C3");
    expect([a.position, b.position]).toEqual([0, 1]);
    await handlers.move({
      viewer: OWNER,
      projectId: PROJECT_ID,
      locationId: b.id,
      direction: "up",
      by: "owner",
    });
    expect((await store.list()).map((item) => item.name)).toEqual([
      "Culvert C3",
      "Chainage 0+000",
    ]);
    // At the top, up changes nothing.
    await handlers.move({
      viewer: OWNER,
      projectId: PROJECT_ID,
      locationId: b.id,
      direction: "up",
      by: "owner",
    });
    expect((await store.list())[0]?.id).toBe(b.id);

    usage.locations.add(a.id);
    expect(
      await codeOf(() =>
        handlers.delete({
          viewer: OWNER,
          projectId: PROJECT_ID,
          locationId: a.id,
          by: "owner",
        }),
      ),
    ).toBe("LOCATION_IN_USE");
    expect(
      await codeOf(() =>
        handlers.update({
          viewer: OWNER,
          projectId: PROJECT_ID,
          locationId: a.id,
          details: { name: "X" },
          expectedUpdatedAt: new Date(0),
          by: "owner",
        }),
      ),
    ).toBe("LOCATION_CHANGED");
  });
});
