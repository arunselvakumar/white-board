import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { POST as disableAmenity } from "@/app/api/construction/masters/amenities/[id]/disable/route";
import { GET as listAmenities } from "@/app/api/construction/masters/amenities/route";
import { GET as listCommonDevelopments } from "@/app/api/construction/masters/common-developments/route";
import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { createProjectLocations } from "@/src/composition/location-resolver";
import {
  generateWingFloors,
  wingConfig,
} from "@/src/projects/domain/wing-generator";
import { DomainError } from "@/src/shared-kernel/domain-error";
import type { LocationRef } from "@/src/shared-kernel/location-ref";
import {
  addProject,
  jsonRequest,
  memberWith,
  ownerWithCompany,
} from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import { POST as updateDevelopments } from "../developments/update/route";
import { POST as deleteLocation } from "../locations/[locationId]/delete/route";
import { POST as createLocation } from "../locations/route";
import { POST as createWing } from "../wings/route";
import { GET as getLocationOptions } from "./route";

type Named = { id: string; name: string };
type Options = {
  structure: "wings" | "locations";
  types: string[];
  wings: (Named & {
    phaseName: string;
    floors: (Named & { kind: string; units: Named[] })[];
  })[];
  amenities: Named[];
  commonDevelopments: Named[];
  locations: Named[];
};

const BASE = `${TEST_ORIGIN}/api/construction/projects/projects`;
const MASTERS = `${TEST_ORIGIN}/api/construction/masters`;

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

/** The item at `index`; a test fails loudly when it is missing. */
function nth<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`No item ${String(index)}`);
  return item;
}

function fetchOptions(cookie: string, projectId: string) {
  return getLocationOptions(
    jsonRequest(`${BASE}/${projectId}/location-options`, cookie),
    params(projectId),
  );
}

async function options(cookie: string, projectId: string): Promise<Options> {
  const response = await fetchOptions(cookie, projectId);
  expect(response.status).toBe(StatusCodes.OK);
  return json<Options>(response);
}

const CONFIG = { floors: 1, startNumber: 1, unitsPerFloor: 2 };

/** A Commercial Wing: Terrace, Commercial Floor 1 (101, 102), Ground (G01, G02). */
async function addWing(
  cookie: string,
  projectId: string,
  name: string,
): Promise<void> {
  const floors = generateWingFloors(
    "commercial",
    wingConfig("commercial", CONFIG),
  ).map((floor) => ({
    kind: floor.kind,
    name: floor.name,
    units: floor.units.map((unit) => ({ name: unit })),
  }));
  const response = await createWing(
    jsonRequest(`${BASE}/${projectId}/wings`, cookie, {
      type: "commercial",
      name,
      config: CONFIG,
      floors,
    }),
    params(projectId),
  );
  expect(response.status).toBe(StatusCodes.CREATED);
}

async function addLocation(
  cookie: string,
  projectId: string,
  name: string,
): Promise<Named> {
  const response = await createLocation(
    jsonRequest(`${BASE}/${projectId}/locations`, cookie, { name }),
    params(projectId),
  );
  expect(response.status).toBe(StatusCodes.CREATED);
  return json<Named>(response);
}

/** The Company's seeded rows of a kind, by name. */
async function seeded(
  cookie: string,
  kind: "amenities" | "common-developments",
): Promise<Map<string, string>> {
  const route = kind === "amenities" ? listAmenities : listCommonDevelopments;
  const body = await json<{ items: Named[] }>(
    await route(jsonRequest(`${MASTERS}/${kind}`, cookie)),
  );
  return new Map(body.items.map((item) => [item.name, item.id]));
}

function idOf(rows: Map<string, string>, name: string): string {
  const id = rows.get(name);
  if (id == null) throw new Error(`No ${name}`);
  return id;
}

async function assign(
  cookie: string,
  projectId: string,
  body: { amenityIds?: string[]; commonDevelopmentIds?: string[] },
): Promise<void> {
  const response = await updateDevelopments(
    jsonRequest(`${BASE}/${projectId}/developments/update`, cookie, body),
    params(projectId),
  );
  expect(response.status).toBe(StatusCodes.OK);
}

async function putOn(memberId: string, projectIds: string[]): Promise<void> {
  await prisma.constructionOrganizationTeamMemberProject.createMany({
    data: projectIds.map((projectId) => ({ memberId, projectId })),
  });
}

describe("Location options HTTP (CM-403)", () => {
  it("is 401 without a Session", async () => {
    const response = await getLocationOptions(
      new Request(
        `${BASE}/0199c0de-0000-7000-8000-000000000001/location-options`,
      ),
      params("0199c0de-0000-7000-8000-000000000001"),
    );
    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
  });

  it("offers no types on an empty Project, with the Project's structure", async () => {
    const owner = await ownerWithCompany();
    const building = await addProject(owner.workspaceId, owner.userId);
    expect(await options(owner.cookie, building)).toEqual({
      structure: "wings",
      types: [],
      wings: [],
      amenities: [],
      commonDevelopments: [],
      locations: [],
    });
    const road = await addProject(owner.workspaceId, owner.userId);
    await prisma.constructionProjectsProject.update({
      where: { id: road },
      data: { projectType: "infrastructure" },
    });
    expect(await options(owner.cookie, road)).toMatchObject({
      structure: "locations",
      types: [],
    });
  });

  it("offers a Project's Wings with Floors and Units, in Phase order", async () => {
    const owner = await ownerWithCompany();
    const projectId = await addProject(owner.workspaceId, owner.userId);
    await addWing(owner.cookie, projectId, "Wing A");
    await addWing(owner.cookie, projectId, "Wing B");

    const body = await options(owner.cookie, projectId);
    expect(body.types).toEqual(["wing"]);
    expect(body.wings.map((wing) => [wing.name, wing.phaseName])).toEqual([
      ["Wing A", "Phase 1"],
      ["Wing B", "Phase 1"],
    ]);
    expect(
      nth(body.wings, 0).floors.map((floor) => [
        floor.kind,
        floor.name,
        floor.units.map((unit) => unit.name),
      ]),
    ).toEqual([
      ["terrace", "Terrace Floor", []],
      ["typed", "Commercial Floor 1", ["101", "102"]],
      ["ground", "Ground Floor", ["G01", "G02"]],
    ]);
  });

  it("offers a Project's Locations in order", async () => {
    const owner = await ownerWithCompany();
    const projectId = await addProject(owner.workspaceId, owner.userId);
    const culvert = await addLocation(owner.cookie, projectId, "Culvert C3");
    const toll = await addLocation(owner.cookie, projectId, "Toll plaza");
    const body = await options(owner.cookie, projectId);
    expect(body.types).toEqual(["location"]);
    expect(body.locations).toEqual([
      { id: culvert.id, name: "Culvert C3" },
      { id: toll.id, name: "Toll plaza" },
    ]);
  });

  it("offers only enabled assigned Amenities and Common Developments", async () => {
    const owner = await ownerWithCompany();
    const projectId = await addProject(owner.workspaceId, owner.userId);
    const amenities = await seeded(owner.cookie, "amenities");
    const common = await seeded(owner.cookie, "common-developments");
    const pool = idOf(amenities, "Swimming Pool");
    const gym = idOf(amenities, "Gymnasium");
    const wall = idOf(common, "Compound Wall");

    // Assigned before it was disabled: the only row this Project has.
    const other = await addProject(owner.workspaceId, owner.userId);
    await assign(owner.cookie, other, { amenityIds: [gym] });
    await assign(owner.cookie, projectId, { amenityIds: [pool, gym] });
    expect(await options(owner.cookie, projectId)).toMatchObject({
      types: ["amenity"],
      amenities: [
        { id: gym, name: "Gymnasium" },
        { id: pool, name: "Swimming Pool" },
      ],
      commonDevelopments: [],
    });

    // Disabled in Masters: stays on the Project, leaves the picker.
    await disableAmenity(
      jsonRequest(`${MASTERS}/amenities/${gym}/disable`, owner.cookie, {}),
      params(gym),
    );
    await assign(owner.cookie, projectId, { commonDevelopmentIds: [wall] });
    await addWing(owner.cookie, projectId, "Wing A");
    await addLocation(owner.cookie, projectId, "Site office");
    const body = await options(owner.cookie, projectId);
    expect(body.types).toEqual([
      "wing",
      "amenity",
      "common_development",
      "location",
    ]);
    expect(body.amenities).toEqual([{ id: pool, name: "Swimming Pool" }]);
    expect(body.commonDevelopments).toEqual([
      { id: wall, name: "Compound Wall" },
    ]);

    // Only disabled ones: no Amenities type.
    expect((await options(owner.cookie, other)).types).toEqual([]);
  });

  it("follows projects.project Read and Project visibility", async () => {
    const owner = await ownerWithCompany();
    const kumari = await addProject(owner.workspaceId, owner.userId);
    const zen = await addProject(owner.workspaceId, owner.userId);
    await addLocation(owner.cookie, kumari, "Culvert C3");

    const outsider = await memberWith(owner, { "projects.wings": ["read"] });
    await putOn(outsider.memberId, [kumari]);
    const denied = await fetchOptions(outsider.cookie, kumari);
    expect(denied.status).toBe(StatusCodes.FORBIDDEN);
    expect((await json<{ code: string }>(denied)).code).toBe(
      "PERMISSION_DENIED",
    );

    const reader = await memberWith(owner, { "projects.project": ["read"] });
    await putOn(reader.memberId, [kumari]);
    expect((await options(reader.cookie, kumari)).types).toEqual(["location"]);
    const notOn = await fetchOptions(reader.cookie, zen);
    expect(notOn.status).toBe(StatusCodes.NOT_FOUND);
    expect((await json<{ code: string }>(notOn)).code).toBe(
      "PROJECT_NOT_FOUND",
    );

    const stranger = await ownerWithCompany("Other Builders");
    const theirs = await fetchOptions(stranger.cookie, kumari);
    expect(theirs.status).toBe(StatusCodes.NOT_FOUND);
    expect((await json<{ code: string }>(theirs)).code).toBe(
      "PROJECT_NOT_FOUND",
    );

    const bad = await fetchOptions(owner.cookie, "not-a-uuid");
    expect(bad.status).toBe(StatusCodes.BAD_REQUEST);
  });

  it("is listed in OpenAPI", async () => {
    const document = await json<{
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    }>(getOpenApi());
    expect(
      document.paths[
        "/api/construction/projects/projects/{id}/location-options"
      ]?.["get"],
    ).toBeDefined();
    expect(
      document.components.schemas[
        "ConstructionProjectsLocationOptionsResponse"
      ],
    ).toBeDefined();
  });
});

describe("LocationResolver on Postgres (CM-403)", () => {
  async function codeOf(
    run: () => Promise<void>,
  ): Promise<{ code: string; status: string } | "ok"> {
    try {
      await run();
      return "ok";
    } catch (error) {
      if (error instanceof DomainError)
        return { code: error.code, status: error.kind };
      throw error;
    }
  }

  it("checks every id is live and the Project's", async () => {
    const owner = await ownerWithCompany();
    const kumari = await addProject(owner.workspaceId, owner.userId);
    const zen = await addProject(owner.workspaceId, owner.userId);
    await addWing(owner.cookie, kumari, "Wing A");
    await addWing(owner.cookie, zen, "Wing Z");
    const culvert = await addLocation(owner.cookie, kumari, "Culvert C3");
    const toll = await addLocation(owner.cookie, zen, "Toll plaza");
    const amenities = await seeded(owner.cookie, "amenities");
    const pool = idOf(amenities, "Swimming Pool");
    const club = idOf(amenities, "Club House");
    await assign(owner.cookie, kumari, { amenityIds: [pool] });
    await disableAmenity(
      jsonRequest(`${MASTERS}/amenities/${pool}/disable`, owner.cookie, {}),
      params(pool),
    );

    const ours = nth((await options(owner.cookie, kumari)).wings, 0);
    const theirs = nth((await options(owner.cookie, zen)).wings, 0);
    const first = nth(ours.floors, 1);
    const ground = nth(ours.floors, 2);
    const resolver = createProjectLocations();
    const check = (ref: LocationRef) => () =>
      resolver.assertOnProject(owner.workspaceId, kumari, ref);
    const wing = (ref: Partial<Extract<LocationRef, { type: "wing" }>>) =>
      check({
        type: "wing",
        wingId: ours.id,
        floorIds: [],
        unitIds: [],
        ...ref,
      });

    expect(
      await codeOf(
        wing({
          floorIds: [first.id],
          unitIds: first.units.map((unit) => unit.id),
        }),
      ),
    ).toBe("ok");
    expect(await codeOf(wing({ wingId: theirs.id }))).toEqual({
      code: "LOCATION_WING_NOT_FOUND",
      status: "invalid",
    });
    expect(
      await codeOf(wing({ floorIds: [nth(theirs.floors, 1).id] })),
    ).toMatchObject({ code: "LOCATION_FLOOR_NOT_ON_WING" });
    expect(
      await codeOf(wing({ unitIds: [nth(nth(theirs.floors, 1).units, 0).id] })),
    ).toMatchObject({ code: "LOCATION_UNIT_NOT_ON_WING" });
    expect(
      await codeOf(
        wing({
          floorIds: [first.id],
          unitIds: [nth(ground.units, 0).id],
        }),
      ),
    ).toMatchObject({ code: "LOCATION_UNIT_NOT_ON_FLOORS" });

    // Assigned, though disabled since: still a valid location.
    expect(await codeOf(check({ type: "amenity", developmentId: pool }))).toBe(
      "ok",
    );
    expect(
      await codeOf(check({ type: "amenity", developmentId: club })),
    ).toMatchObject({ code: "LOCATION_AMENITY_NOT_ASSIGNED" });

    expect(
      await codeOf(check({ type: "location", locationId: culvert.id })),
    ).toBe("ok");
    expect(
      await codeOf(check({ type: "location", locationId: toll.id })),
    ).toMatchObject({ code: "LOCATION_NOT_ON_PROJECT" });
    const removed = await deleteLocation(
      jsonRequest(
        `${BASE}/${kumari}/locations/${culvert.id}/delete`,
        owner.cookie,
        {},
      ),
      { params: Promise.resolve({ id: kumari, locationId: culvert.id }) },
    );
    expect(removed.status).toBe(StatusCodes.NO_CONTENT);
    expect(
      await codeOf(check({ type: "location", locationId: culvert.id })),
    ).toMatchObject({ code: "LOCATION_NOT_ON_PROJECT" });

    // Another Company never sees this Project's rows.
    const stranger = await ownerWithCompany("Other Builders");
    expect(
      await codeOf(() =>
        resolver.assertOnProject(stranger.workspaceId, kumari, {
          type: "wing",
          wingId: ours.id,
          floorIds: [],
          unitIds: [],
        }),
      ),
    ).toMatchObject({ code: "LOCATION_WING_NOT_FOUND" });
  });
});
