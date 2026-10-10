import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import {
  generateWingFloors,
  wingConfig,
  type WingConfigInput,
  type WingType,
} from "@/src/projects/domain/wing-generator";
import {
  addProject,
  jsonRequest,
  memberWith,
  ownerWithCompany,
} from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import { POST as deleteProject } from "../delete/route";
import { POST as deletePhase } from "../phases/[phaseId]/delete/route";
import { POST as renamePhase } from "../phases/[phaseId]/rename/route";
import { GET as listPhases, POST as createPhase } from "../phases/route";
import { POST as deleteWing } from "./[wingId]/delete/route";
import { GET as getWing } from "./[wingId]/route";
import { POST as updateWing } from "./[wingId]/update/route";
import { GET as listWings, POST as createWing } from "./route";

/** The item at `index`; a test fails loudly when it is missing. */
function nth<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`No item ${String(index)}`);
  return item;
}

type Company = Awaited<ReturnType<typeof ownerWithCompany>>;

type Unit = { id: string; name: string; position: number };
type Floor = {
  id: string;
  kind: string;
  name: string;
  level: number;
  units: Unit[];
};
type WingBody = {
  id: string;
  phaseId: string;
  type: string;
  name: string;
  config: Record<string, unknown>;
  floors: Floor[];
  totals: { floors: number; units: number };
  updatedAt: string;
};
type PhaseBody = { id: string; name: string; wings: number; updatedAt: string };
type Overview = {
  phases: (PhaseBody & {
    items: { id: string; name: string; floors: number; units: number }[];
    floors: number;
    units: number;
  })[];
  totals: { wings: number; floors: number; units: number };
};

const BASE = `${TEST_ORIGIN}/api/construction/projects/projects`;

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function wingParams(id: string, wingId: string) {
  return { params: Promise.resolve({ id, wingId }) };
}

function phaseParams(id: string, phaseId: string) {
  return { params: Promise.resolve({ id, phaseId }) };
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function error(
  response: Response,
): Promise<{ code: string; details?: unknown }> {
  return json(response);
}

/** What Continue to Units shows: the generated floors as editor rows. */
function editorFloors(type: WingType, config: WingConfigInput) {
  return generateWingFloors(type, wingConfig(type, config)).map((floor) => ({
    kind: floor.kind,
    name: floor.name,
    units: floor.units.map((name) => ({ name })),
  }));
}

const COMMERCIAL = {
  floors: 2,
  startNumber: 1,
  unitsPerFloor: 2,
  basements: 1,
};

function addWing(
  cookie: string,
  projectId: string,
  body: Record<string, unknown> = {},
) {
  return createWing(
    jsonRequest(`${BASE}/${projectId}/wings`, cookie, {
      type: "commercial",
      name: "Wing A",
      config: COMMERCIAL,
      floors: editorFloors("commercial", COMMERCIAL),
      ...body,
    }),
    params(projectId),
  );
}

async function wingAdded(
  cookie: string,
  projectId: string,
  body: Record<string, unknown> = {},
): Promise<WingBody> {
  const response = await addWing(cookie, projectId, body);
  expect(response.status).toBe(StatusCodes.CREATED);
  return json<WingBody>(response);
}

function overview(cookie: string, projectId: string) {
  return listWings(
    jsonRequest(`${BASE}/${projectId}/wings`, cookie),
    params(projectId),
  );
}

function save(
  cookie: string,
  projectId: string,
  wing: WingBody,
  body: Record<string, unknown>,
) {
  return updateWing(
    jsonRequest(`${BASE}/${projectId}/wings/${wing.id}/update`, cookie, {
      name: wing.name,
      floors: asSaved(wing),
      expectedUpdatedAt: wing.updatedAt,
      ...body,
    }),
    wingParams(projectId, wing.id),
  );
}

type FloorInput = {
  id?: string;
  kind: string;
  name: string;
  units: { id?: string; name: string }[];
};

/** Every floor and unit as Edit Wing sends it back: with its id. */
function asSaved(wing: WingBody): FloorInput[] {
  return wing.floors.map((floor) => ({
    id: floor.id,
    kind: floor.kind,
    name: floor.name,
    units: floor.units.map((unit) => ({ id: unit.id, name: unit.name })),
  }));
}

function addPhase(cookie: string, projectId: string, name: string) {
  return createPhase(
    jsonRequest(`${BASE}/${projectId}/phases`, cookie, { name }),
    params(projectId),
  );
}

async function project(company: Company): Promise<string> {
  return addProject(company.workspaceId, company.userId);
}

describe("Phases and Wings HTTP (CM-402)", () => {
  it("adds a Wing from configuration and editor rows, with Phase 1, and shows totals", async () => {
    const owner = await ownerWithCompany();
    const projectId = await project(owner);

    const empty = await json<Overview>(await overview(owner.cookie, projectId));
    expect(empty).toEqual({
      phases: [],
      totals: { wings: 0, floors: 0, units: 0 },
    });

    const wing = await wingAdded(owner.cookie, projectId);
    expect(wing.name).toBe("Wing A");
    expect(wing.config).toEqual({ ...COMMERCIAL, terrace: true });
    expect(wing.totals).toEqual({ floors: 5, units: 6 });
    expect(
      wing.floors.map((floor) => [
        floor.kind,
        floor.name,
        floor.level,
        floor.units.map((unit) => unit.name).join(" "),
      ]),
    ).toEqual([
      ["terrace", "Terrace Floor", 3, ""],
      ["typed", "Commercial Floor 2", 2, "201 202"],
      ["typed", "Commercial Floor 1", 1, "101 102"],
      ["ground", "Ground Floor", 0, "G01 G02"],
      ["basement", "Basement Floor 1", -1, ""],
    ]);

    const scheme = await wingAdded(owner.cookie, projectId, {
      type: "plotting_scheme",
      name: "Layout East",
      config: { units: 3 },
      floors: editorFloors("plotting_scheme", { units: 3 }),
    });
    expect(scheme.floors).toHaveLength(1);
    expect(scheme.floors[0]?.units.map((unit) => unit.name)).toEqual([
      "Plot 1",
      "Plot 2",
      "Plot 3",
    ]);

    const listed = await json<Overview>(
      await overview(owner.cookie, projectId),
    );
    expect(listed.phases).toHaveLength(1);
    expect(listed.phases[0]).toMatchObject({
      name: "Phase 1",
      wings: 2,
      floors: 6,
      units: 9,
    });
    expect(listed.phases[0]?.items.map((item) => item.name)).toEqual([
      "Wing A",
      "Layout East",
    ]);
    expect(listed.totals).toEqual({ wings: 2, floors: 6, units: 9 });
    expect(wing.phaseId).toBe(listed.phases[0]?.id);

    const fetched = await getWing(
      jsonRequest(`${BASE}/${projectId}/wings/${wing.id}`, owner.cookie),
      wingParams(projectId, wing.id),
    );
    expect(fetched.status).toBe(StatusCodes.OK);
    expect(await json<WingBody>(fetched)).toEqual(wing);
  });

  it("keeps floor and unit ids on edit, adds and removes rows, and guards with updatedAt", async () => {
    const owner = await ownerWithCompany();
    const projectId = await project(owner);
    const wing = await wingAdded(owner.cookie, projectId);
    const floors = asSaved(wing);
    const typed1 = nth(floors, 2);
    const ground = nth(floors, 3);
    const removed = nth(typed1.units, 1);
    // Rename 101 → Shop 1, drop 102, add G03, add a Stilt Floor, rename a floor.
    floors[2] = {
      ...typed1,
      name: "Shops Floor",
      units: [{ ...nth(typed1.units, 0), name: "Shop 1" }],
    };
    floors[3] = { ...ground, units: [...ground.units, { name: "G03" }] };
    floors.splice(4, 0, { kind: "other", name: "Stilt Floor", units: [] });

    const response = await save(owner.cookie, projectId, wing, {
      name: "Wing A1",
      floors,
    });
    expect(response.status).toBe(StatusCodes.OK);
    const saved = await json<WingBody>(response);
    expect(saved.name).toBe("Wing A1");
    expect(saved.totals).toEqual({ floors: 6, units: 6 });
    expect(saved.floors[2]).toMatchObject({
      id: typed1.id,
      name: "Shops Floor",
      units: [{ id: nth(typed1.units, 0).id, name: "Shop 1", position: 0 }],
    });
    expect(saved.floors[3]?.id).toBe(ground.id);
    expect(saved.floors[3]?.units.slice(0, 2).map((unit) => unit.id)).toEqual(
      ground.units.map((unit) => unit.id),
    );
    expect(saved.floors[4]).toMatchObject({
      kind: "other",
      name: "Stilt Floor",
      level: -1,
    });
    expect(saved.floors[5]?.level).toBe(-2);

    // The removed unit is a tombstone, not gone.
    const row = await prisma.constructionProjectsUnit.findUnique({
      where: { id: removed.id },
    });
    expect(row?.deletedAt).not.toBeNull();

    // Swapping two names in one save works.
    const swapped = asSaved(saved);
    const ground2 = nth(swapped, 3);
    swapped[3] = {
      ...ground2,
      units: [
        { ...nth(ground2.units, 0), name: nth(ground2.units, 1).name },
        { ...nth(ground2.units, 1), name: nth(ground2.units, 0).name },
        nth(ground2.units, 2),
      ],
    };
    const swap = await save(owner.cookie, projectId, saved, {
      floors: swapped,
    });
    expect(swap.status).toBe(StatusCodes.OK);
    const afterSwap = await json<WingBody>(swap);
    expect(afterSwap.floors[3]?.units.map((unit) => unit.name)).toEqual([
      "G02",
      "G01",
      "G03",
    ]);

    // The first save's updatedAt is stale now.
    const stale = await save(owner.cookie, projectId, saved, {});
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect((await error(stale)).code).toBe("WING_CHANGED");

    // A unit id from another Wing is refused.
    const other = await wingAdded(owner.cookie, projectId, { name: "Wing B" });
    const foreign = asSaved(afterSwap);
    foreign[1] = {
      ...nth(foreign, 1),
      units: [{ id: nth(nth(other.floors, 1).units, 0).id, name: "999" }],
    };
    const refused = await save(owner.cookie, projectId, afterSwap, {
      floors: foreign,
    });
    expect(refused.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await error(refused)).toMatchObject({
      code: "WING_UNIT_NOT_FOUND",
      details: { floorIndex: 1, unitIndex: 0 },
    });
  });

  it("validates names, limits and kinds", async () => {
    const owner = await ownerWithCompany();
    const projectId = await project(owner);
    await wingAdded(owner.cookie, projectId);

    const duplicate = await addWing(owner.cookie, projectId, {
      name: " wing  a ",
    });
    expect(duplicate.status).toBe(StatusCodes.CONFLICT);
    expect((await error(duplicate)).code).toBe("WING_NAME_IN_USE");

    const floors = editorFloors("commercial", COMMERCIAL);
    floors[3] = {
      ...nth(floors, 3),
      units: [{ name: "g01" }, { name: "101" }],
    };
    const sameUnit = await addWing(owner.cookie, projectId, {
      name: "Wing B",
      floors,
    });
    expect(sameUnit.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await error(sameUnit)).toEqual(
      expect.objectContaining({
        code: "WING_UNIT_NAME_DUPLICATE",
        details: { floorIndex: 3, unitIndex: 1 },
      }),
    );

    for (const [config, code, field] of [
      [{ ...COMMERCIAL, floors: 151 }, "WING_FLOORS_INVALID", "floors"],
      [
        { ...COMMERCIAL, unitsPerFloor: 51 },
        "WING_UNITS_PER_FLOOR_INVALID",
        "unitsPerFloor",
      ],
      [{ ...COMMERCIAL, basements: 11 }, "WING_BASEMENTS_INVALID", "basements"],
      [
        { ...COMMERCIAL, startNumber: 1000 },
        "WING_START_NUMBER_INVALID",
        "startNumber",
      ],
    ] as const) {
      const response = await addWing(owner.cookie, projectId, {
        name: "Wing C",
        config,
      });
      expect(response.status).toBe(StatusCodes.BAD_REQUEST);
      expect(await error(response)).toMatchObject({ code, details: { field } });
    }

    const tooMany = await addWing(owner.cookie, projectId, {
      name: "Plots",
      type: "plotting_scheme",
      config: { units: 2000 },
      floors: [
        {
          kind: "site",
          name: "Plots",
          units: Array.from({ length: 5001 }, (_, index) => ({
            name: `Plot ${String(index + 1)}`,
          })),
        },
      ],
    });
    expect(tooMany.status).toBe(StatusCodes.BAD_REQUEST);
    expect((await error(tooMany)).code).toBe("WING_TOO_MANY_UNITS");

    const misplaced = await addWing(owner.cookie, projectId, {
      name: "Wing D",
      floors: [
        { kind: "ground", name: "Ground Floor", units: [] },
        { kind: "terrace", name: "Terrace Floor", units: [] },
      ],
    });
    expect(misplaced.status).toBe(StatusCodes.BAD_REQUEST);
    expect((await error(misplaced)).code).toBe("WING_FLOOR_ORDER_INVALID");

    const badType = await addWing(owner.cookie, projectId, { type: "tower" });
    expect(badType.status).toBe(StatusCodes.BAD_REQUEST);
    expect((await error(badType)).code).toBe("VALIDATION_ERROR");

    // A big Wing goes in one request: 99 floors × 50 units + Ground = 5,000.
    const big = { floors: 99, startNumber: 1, unitsPerFloor: 50 };
    const tower = await wingAdded(owner.cookie, projectId, {
      name: "Tower",
      type: "residential",
      config: big,
      floors: editorFloors("residential", big),
    });
    expect(tower.totals).toEqual({ floors: 101, units: 5000 });
    const renamedAll = asSaved(tower).map((floor) => ({
      ...floor,
      units: floor.units.map((unit) => ({ ...unit, name: `R-${unit.name}` })),
    }));
    const edited = await save(owner.cookie, projectId, tower, {
      floors: renamedAll,
    });
    expect(edited.status).toBe(StatusCodes.OK);
    expect((await json<WingBody>(edited)).floors[1]?.units[0]?.name).toBe(
      "R-9901",
    );
  });

  it("adds, renames and deletes Phases; a Phase with Wings stays", async () => {
    const owner = await ownerWithCompany();
    const projectId = await project(owner);
    const first = await addPhase(owner.cookie, projectId, "Phase 1");
    expect(first.status).toBe(StatusCodes.CREATED);
    const phase1 = await json<PhaseBody>(first);
    const phase2 = await json<PhaseBody>(
      await addPhase(owner.cookie, projectId, "Phase 2"),
    );
    const clash = await addPhase(owner.cookie, projectId, "PHASE 2");
    expect(clash.status).toBe(StatusCodes.CONFLICT);
    expect((await error(clash)).code).toBe("PHASE_NAME_IN_USE");

    // No phaseId: the first Phase. With one: that Phase.
    const a = await wingAdded(owner.cookie, projectId);
    expect(a.phaseId).toBe(phase1.id);
    const b = await wingAdded(owner.cookie, projectId, {
      name: "Wing B",
      phaseId: phase2.id,
    });
    expect(b.phaseId).toBe(phase2.id);
    const foreignPhase = await addWing(owner.cookie, projectId, {
      name: "Wing C",
      phaseId: "0199c4a0-0000-7000-8000-000000000999",
    });
    expect(foreignPhase.status).toBe(StatusCodes.BAD_REQUEST);
    expect((await error(foreignPhase)).code).toBe("WING_PHASE_INVALID");

    const renamed = await renamePhase(
      jsonRequest(
        `${BASE}/${projectId}/phases/${phase2.id}/rename`,
        owner.cookie,
        { name: "Tower block", expectedUpdatedAt: phase2.updatedAt },
      ),
      phaseParams(projectId, phase2.id),
    );
    expect(renamed.status).toBe(StatusCodes.OK);
    expect(await json<PhaseBody>(renamed)).toMatchObject({
      name: "Tower block",
      wings: 1,
    });
    const staleRename = await renamePhase(
      jsonRequest(
        `${BASE}/${projectId}/phases/${phase2.id}/rename`,
        owner.cookie,
        { name: "Again", expectedUpdatedAt: phase2.updatedAt },
      ),
      phaseParams(projectId, phase2.id),
    );
    expect(staleRename.status).toBe(StatusCodes.CONFLICT);
    expect((await error(staleRename)).code).toBe("PHASE_CHANGED");

    const removePhase2 = () =>
      deletePhase(
        jsonRequest(
          `${BASE}/${projectId}/phases/${phase2.id}/delete`,
          owner.cookie,
          {},
        ),
        phaseParams(projectId, phase2.id),
      );
    const notEmpty = await removePhase2();
    expect(notEmpty.status).toBe(StatusCodes.CONFLICT);
    expect((await error(notEmpty)).code).toBe("PHASE_NOT_EMPTY");

    // Moving the Wing to Phase 1 empties Phase 2.
    const moved = await save(owner.cookie, projectId, b, {
      phaseId: phase1.id,
    });
    expect(moved.status).toBe(StatusCodes.OK);
    expect((await json<WingBody>(moved)).phaseId).toBe(phase1.id);
    expect((await removePhase2()).status).toBe(StatusCodes.NO_CONTENT);

    const phases = await json<{ items: PhaseBody[] }>(
      await listPhases(
        jsonRequest(`${BASE}/${projectId}/phases`, owner.cookie),
        params(projectId),
      ),
    );
    expect(phases.items.map((item) => [item.name, item.wings])).toEqual([
      ["Phase 1", 2],
    ]);
    // A deleted Phase's name is free again.
    expect((await addPhase(owner.cookie, projectId, "Phase 2")).status).toBe(
      StatusCodes.CREATED,
    );
    expect(a.id).toBeDefined();
  });

  it("deletes a Wing with its floors and units, then frees its name", async () => {
    const owner = await ownerWithCompany();
    const projectId = await project(owner);
    const wing = await wingAdded(owner.cookie, projectId);

    const refused = await deleteProject(
      jsonRequest(`${BASE}/${projectId}/delete`, owner.cookie, {}),
      params(projectId),
    );
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect((await error(refused)).code).toBe("PROJECT_IN_USE");

    const deleted = await deleteWing(
      jsonRequest(
        `${BASE}/${projectId}/wings/${wing.id}/delete`,
        owner.cookie,
        {},
      ),
      wingParams(projectId, wing.id),
    );
    expect(deleted.status).toBe(StatusCodes.NO_CONTENT);
    const units = await prisma.constructionProjectsUnit.findMany({
      where: { wingId: wing.id },
    });
    expect(units).toHaveLength(6);
    expect(units.every((unit) => unit.deletedAt != null)).toBe(true);
    const gone = await getWing(
      jsonRequest(`${BASE}/${projectId}/wings/${wing.id}`, owner.cookie),
      wingParams(projectId, wing.id),
    );
    expect(gone.status).toBe(StatusCodes.NOT_FOUND);
    expect((await error(gone)).code).toBe("WING_NOT_FOUND");
    const listed = await json<Overview>(
      await overview(owner.cookie, projectId),
    );
    expect(listed.totals).toEqual({ wings: 0, floors: 0, units: 0 });
    expect(listed.phases[0]?.items).toEqual([]);
    await wingAdded(owner.cookie, projectId);

    const audits = await prisma.constructionOrganizationAuditEvent.findMany({
      where: { workspaceId: owner.workspaceId, entityType: "wing" },
      orderBy: { occurredAt: "asc" },
    });
    expect(audits.map((audit) => audit.action)).toEqual([
      "wing.created",
      "wing.deleted",
      "wing.created",
    ]);
  });

  it("follows projects.wings flags and Project visibility", async () => {
    const owner = await ownerWithCompany();
    const tower = await project(owner);
    const villas = await project(owner);
    const wing = await wingAdded(owner.cookie, tower);
    const assign = (memberId: string, projectIds: string[]) =>
      prisma.constructionOrganizationTeamMemberProject.createMany({
        data: projectIds.map((projectId) => ({ memberId, projectId })),
      });

    const outsider = await memberWith(owner, {
      "projects.project": ["read"],
    });
    await assign(outsider.memberId, [tower]);
    for (const response of [
      await overview(outsider.cookie, tower),
      await addWing(outsider.cookie, tower, { name: "X" }),
      await addPhase(outsider.cookie, tower, "Phase 9"),
    ]) {
      expect(response.status).toBe(StatusCodes.FORBIDDEN);
      expect((await error(response)).code).toBe("PERMISSION_DENIED");
    }

    const reader = await memberWith(owner, { "projects.wings": ["read"] });
    await assign(reader.memberId, [tower]);
    expect((await overview(reader.cookie, tower)).status).toBe(StatusCodes.OK);
    expect(
      (
        await getWing(
          jsonRequest(`${BASE}/${tower}/wings/${wing.id}`, reader.cookie),
          wingParams(tower, wing.id),
        )
      ).status,
    ).toBe(StatusCodes.OK);
    for (const response of [
      await addWing(reader.cookie, tower, { name: "X" }),
      await save(reader.cookie, tower, wing, {}),
      await deleteWing(
        jsonRequest(
          `${BASE}/${tower}/wings/${wing.id}/delete`,
          reader.cookie,
          {},
        ),
        wingParams(tower, wing.id),
      ),
    ])
      expect(response.status).toBe(StatusCodes.FORBIDDEN);

    const creator = await memberWith(owner, {
      "projects.wings": ["read", "create"],
    });
    await assign(creator.memberId, [tower, villas]);
    expect((await addWing(creator.cookie, villas)).status).toBe(
      StatusCodes.CREATED,
    );
    expect((await save(creator.cookie, tower, wing, {})).status).toBe(
      StatusCodes.FORBIDDEN,
    );

    const editor = await memberWith(owner, {
      "projects.wings": ["read", "update", "delete"],
    });
    await assign(editor.memberId, [villas]);
    // Not on the Project: as if it did not exist.
    const hidden = await overview(editor.cookie, tower);
    expect(hidden.status).toBe(StatusCodes.NOT_FOUND);
    expect((await error(hidden)).code).toBe("PROJECT_NOT_FOUND");
    expect((await save(editor.cookie, tower, wing, {})).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    await assign(editor.memberId, [tower]);
    expect((await save(editor.cookie, tower, wing, {})).status).toBe(
      StatusCodes.OK,
    );

    // Another Company's Owner sees nothing of it.
    const stranger = await ownerWithCompany("Other Builders");
    for (const response of [
      await overview(stranger.cookie, tower),
      await getWing(
        jsonRequest(`${BASE}/${tower}/wings/${wing.id}`, stranger.cookie),
        wingParams(tower, wing.id),
      ),
      await addWing(stranger.cookie, tower),
    ]) {
      expect(response.status).toBe(StatusCodes.NOT_FOUND);
      expect((await error(response)).code).toBe("PROJECT_NOT_FOUND");
    }
    // A Wing id under another of the Company's Projects is not found.
    const wrongProject = await getWing(
      jsonRequest(`${BASE}/${villas}/wings/${wing.id}`, owner.cookie),
      wingParams(villas, wing.id),
    );
    expect(wrongProject.status).toBe(StatusCodes.NOT_FOUND);
    expect((await error(wrongProject)).code).toBe("WING_NOT_FOUND");
  });

  it("is listed in OpenAPI", async () => {
    const document = await json<{
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    }>(getOpenApi());
    const project = "/api/construction/projects/projects/{id}";
    for (const [path, method] of [
      [`${project}/phases`, "get"],
      [`${project}/phases`, "post"],
      [`${project}/phases/{phaseId}/rename`, "post"],
      [`${project}/phases/{phaseId}/delete`, "post"],
      [`${project}/wings`, "get"],
      [`${project}/wings`, "post"],
      [`${project}/wings/{wingId}`, "get"],
      [`${project}/wings/{wingId}/update`, "post"],
      [`${project}/wings/{wingId}/delete`, "post"],
    ] as const)
      expect(document.paths[path]?.[method], `${method} ${path}`).toBeDefined();
    for (const name of [
      "CreateConstructionProjectsWingRequest",
      "ConstructionProjectsWingResponse",
      "ListConstructionProjectsWingsResponse",
      "ConstructionProjectsPhaseResponse",
    ])
      expect(document.components.schemas[name], name).toBeDefined();
  });
});
