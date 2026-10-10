import { describe, expect, it } from "vitest";

import type { WingTree } from "@/src/projects/application/structure-read-model";
import { DomainError } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";
import type { LocationRef } from "@/src/shared-kernel/location-ref";

import {
  ProjectLocations,
  type AssignedDevelopment,
  type LocationSources,
} from "./location-resolver";

const WORKSPACE = "ws_1";
const PROJECT = newId();
const OTHER_PROJECT = newId();

function wingTree(name: string, phaseName = "Phase 1"): WingTree {
  const unit = (unitName: string, position: number) => ({
    id: newId(),
    name: unitName,
    position,
  });
  return {
    id: newId(),
    phaseId: newId(),
    phaseName,
    type: "commercial",
    name,
    floors: [
      {
        id: newId(),
        kind: "terrace",
        name: "Terrace Floor",
        level: 2,
        units: [],
      },
      {
        id: newId(),
        kind: "typed",
        name: "Commercial Floor 1",
        level: 1,
        units: [unit("101", 0), unit("102", 1)],
      },
      {
        id: newId(),
        kind: "ground",
        name: "Ground Floor",
        level: 0,
        units: [unit("G01", 0), unit("G02", 1)],
      },
    ],
  };
}

/** The floor at `index` of a Wing; a test fails loudly when it is missing. */
function floorOf(wing: WingTree, index: number) {
  const floor = wing.floors[index];
  if (floor === undefined) throw new Error(`No floor ${String(index)}`);
  return floor;
}

function unitIds(wing: WingTree, index: number): string[] {
  return floorOf(wing, index).units.map((unit) => unit.id);
}

type Project = {
  wings: WingTree[];
  locations: { id: string; name: string }[];
  amenity: AssignedDevelopment[];
  common_development: AssignedDevelopment[];
};

function emptyProject(): Project {
  return { wings: [], locations: [], amenity: [], common_development: [] };
}

function sourcesOf(projects: Map<string, Project>): LocationSources {
  const of = (projectId: string) => projects.get(projectId) ?? emptyProject();
  return {
    wings: (_, projectId) => Promise.resolve(of(projectId).wings),
    wing: (_, projectId, wingId) =>
      Promise.resolve(
        of(projectId).wings.find((wing) => wing.id === wingId) ?? null,
      ),
    locations: (_, projectId) => Promise.resolve(of(projectId).locations),
    developments: (_, projectId) =>
      Promise.resolve({
        amenity: of(projectId).amenity,
        common_development: of(projectId).common_development,
      }),
  };
}

async function failure(
  resolver: ProjectLocations,
  ref: LocationRef,
): Promise<DomainError> {
  try {
    await resolver.assertOnProject(WORKSPACE, PROJECT, ref);
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error("Expected a DomainError");
}

function setup() {
  const wingA = wingTree("Wing A");
  const wingB = wingTree("Wing B", "Phase 2");
  const elsewhere = wingTree("Wing C");
  const pool = { id: newId(), name: "Swimming Pool", disabled: false };
  const gym = { id: newId(), name: "Gymnasium", disabled: true };
  const wall = { id: newId(), name: "Compound Wall", disabled: false };
  const culvert = { id: newId(), name: "Culvert C3" };
  const project: Project = {
    wings: [wingA, wingB],
    locations: [culvert],
    amenity: [gym, pool],
    common_development: [wall],
  };
  const other: Project = {
    ...emptyProject(),
    wings: [elsewhere],
    locations: [{ id: newId(), name: "Toll plaza" }],
  };
  const resolver = new ProjectLocations(
    sourcesOf(
      new Map([
        [PROJECT, project],
        [OTHER_PROJECT, other],
      ]),
    ),
  );
  return { resolver, wingA, wingB, elsewhere, pool, gym, wall, culvert, other };
}

describe("ProjectLocations.assertOnProject", () => {
  it("accepts a Wing alone, with Floors, and with Units on those Floors", async () => {
    const { resolver, wingA } = setup();
    const ground = floorOf(wingA, 2);
    for (const ref of [
      { wingId: wingA.id, floorIds: [], unitIds: [] },
      { wingId: wingA.id, floorIds: [ground.id], unitIds: [] },
      {
        wingId: wingA.id,
        floorIds: [ground.id, floorOf(wingA, 1).id],
        unitIds: [...unitIds(wingA, 2), ...unitIds(wingA, 1)],
      },
      // No Floors chosen: any Unit of the Wing.
      { wingId: wingA.id, floorIds: [], unitIds: unitIds(wingA, 1) },
    ])
      await expect(
        resolver.assertOnProject(WORKSPACE, PROJECT, { type: "wing", ...ref }),
      ).resolves.toBeUndefined();
  });

  it("refuses a Wing that is not the Project's", async () => {
    const { resolver, elsewhere } = setup();
    for (const wingId of [elsewhere.id, newId()])
      await expect(
        failure(resolver, { type: "wing", wingId, floorIds: [], unitIds: [] }),
      ).resolves.toMatchObject({
        code: "LOCATION_WING_NOT_FOUND",
        kind: "invalid",
        details: { field: "wingId", ids: [wingId] },
      });
  });

  it("refuses Floors of another Wing, naming them", async () => {
    const { resolver, wingA, wingB } = setup();
    const stray = floorOf(wingB, 1).id;
    await expect(
      failure(resolver, {
        type: "wing",
        wingId: wingA.id,
        floorIds: [floorOf(wingA, 1).id, stray],
        unitIds: [],
      }),
    ).resolves.toMatchObject({
      code: "LOCATION_FLOOR_NOT_ON_WING",
      details: { field: "floorIds", ids: [stray] },
    });
  });

  it("refuses Units of another Wing, and Units off the chosen Floors", async () => {
    const { resolver, wingA, wingB } = setup();
    const [stray = ""] = unitIds(wingB, 1);
    await expect(
      failure(resolver, {
        type: "wing",
        wingId: wingA.id,
        floorIds: [],
        unitIds: [...unitIds(wingA, 1), stray],
      }),
    ).resolves.toMatchObject({
      code: "LOCATION_UNIT_NOT_ON_WING",
      details: { field: "unitIds", ids: [stray] },
    });
    const groundUnits = unitIds(wingA, 2);
    await expect(
      failure(resolver, {
        type: "wing",
        wingId: wingA.id,
        floorIds: [floorOf(wingA, 1).id],
        unitIds: [...unitIds(wingA, 1), ...groundUnits],
      }),
    ).resolves.toMatchObject({
      code: "LOCATION_UNIT_NOT_ON_FLOORS",
      details: { field: "unitIds", ids: groundUnits },
    });
  });

  it("accepts assigned Amenities and Common Developments, disabled ones too", async () => {
    const { resolver, pool, gym, wall } = setup();
    for (const ref of [
      { type: "amenity", developmentId: pool.id },
      { type: "amenity", developmentId: gym.id },
      { type: "common_development", developmentId: wall.id },
    ] as const)
      await expect(
        resolver.assertOnProject(WORKSPACE, PROJECT, ref),
      ).resolves.toBeUndefined();
  });

  it("refuses a development that is not assigned, or of the other kind", async () => {
    const { resolver, pool, wall } = setup();
    await expect(
      failure(resolver, { type: "amenity", developmentId: wall.id }),
    ).resolves.toMatchObject({
      code: "LOCATION_AMENITY_NOT_ASSIGNED",
      details: { field: "developmentId", ids: [wall.id] },
    });
    await expect(
      failure(resolver, { type: "common_development", developmentId: pool.id }),
    ).resolves.toMatchObject({
      code: "LOCATION_COMMON_DEVELOPMENT_NOT_ASSIGNED",
    });
  });

  it("accepts the Project's Locations and refuses another Project's", async () => {
    const { resolver, culvert, other } = setup();
    await expect(
      resolver.assertOnProject(WORKSPACE, PROJECT, {
        type: "location",
        locationId: culvert.id,
      }),
    ).resolves.toBeUndefined();
    const stray = other.locations[0]?.id ?? "";
    await expect(
      failure(resolver, { type: "location", locationId: stray }),
    ).resolves.toMatchObject({
      code: "LOCATION_NOT_ON_PROJECT",
      details: { field: "locationId", ids: [stray] },
    });
  });
});

describe("ProjectLocations.options", () => {
  it("offers only the types the Project has rows for, and only enabled developments", async () => {
    const { resolver, wingA, pool, wall, culvert } = setup();
    const options = await resolver.options(WORKSPACE, PROJECT);
    expect(options.types).toEqual([
      "wing",
      "amenity",
      "common_development",
      "location",
    ]);
    expect(options.wings.map((wing) => [wing.name, wing.phaseName])).toEqual([
      ["Wing A", "Phase 1"],
      ["Wing B", "Phase 2"],
    ]);
    expect(options.wings[0]?.floors[2]).toEqual({
      id: floorOf(wingA, 2).id,
      name: "Ground Floor",
      kind: "ground",
      units: floorOf(wingA, 2).units.map(({ id, name }) => ({ id, name })),
    });
    expect(options.amenities).toEqual([{ id: pool.id, name: pool.name }]);
    expect(options.commonDevelopments).toEqual([
      { id: wall.id, name: wall.name },
    ]);
    expect(options.locations).toEqual([culvert]);
  });

  it("offers no types on an empty Project, and none for disabled developments alone", async () => {
    const empty = new ProjectLocations(sourcesOf(new Map()));
    expect(await empty.options(WORKSPACE, PROJECT)).toEqual({
      types: [],
      wings: [],
      amenities: [],
      commonDevelopments: [],
      locations: [],
    });
    const onlyDisabled = new ProjectLocations(
      sourcesOf(
        new Map([
          [
            PROJECT,
            {
              ...emptyProject(),
              amenity: [{ id: newId(), name: "Gymnasium", disabled: true }],
              locations: [{ id: newId(), name: "Culvert C3" }],
            },
          ],
        ]),
      ),
    );
    expect((await onlyDisabled.options(WORKSPACE, PROJECT)).types).toEqual([
      "location",
    ]);
  });
});
