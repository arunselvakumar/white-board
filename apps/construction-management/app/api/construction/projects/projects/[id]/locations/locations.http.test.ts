import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import {
  addProject,
  jsonRequest,
  memberWith,
  ownerWithCompany,
} from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import { POST as deleteProject } from "../delete/route";
import { POST as deleteLocation } from "./[locationId]/delete/route";
import { POST as moveLocation } from "./[locationId]/move/route";
import { POST as updateLocation } from "./[locationId]/update/route";
import { GET as listLocations, POST as createLocation } from "./route";

type LocationBody = {
  id: string;
  name: string;
  description: string | null;
  position: number;
  updatedAt: string;
};

const BASE = `${TEST_ORIGIN}/api/construction/projects/projects`;

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function locationParams(id: string, locationId: string) {
  return { params: Promise.resolve({ id, locationId }) };
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function codeOf(response: Response): Promise<string> {
  return (await json<{ code: string }>(response)).code;
}

function add(
  cookie: string,
  projectId: string,
  body: { name: string; description?: string | null },
) {
  return createLocation(
    jsonRequest(`${BASE}/${projectId}/locations`, cookie, body),
    params(projectId),
  );
}

async function added(
  cookie: string,
  projectId: string,
  name: string,
  description?: string,
): Promise<LocationBody> {
  const response = await add(cookie, projectId, { name, description });
  expect(response.status).toBe(StatusCodes.CREATED);
  return json<LocationBody>(response);
}

function list(cookie: string, projectId: string) {
  return listLocations(
    jsonRequest(`${BASE}/${projectId}/locations`, cookie),
    params(projectId),
  );
}

async function names(cookie: string, projectId: string): Promise<string[]> {
  const response = await list(cookie, projectId);
  expect(response.status).toBe(StatusCodes.OK);
  return (await json<{ items: LocationBody[] }>(response)).items.map(
    (item) => item.name,
  );
}

function move(
  cookie: string,
  projectId: string,
  locationId: string,
  direction: "up" | "down",
) {
  return moveLocation(
    jsonRequest(`${BASE}/${projectId}/locations/${locationId}/move`, cookie, {
      direction,
    }),
    locationParams(projectId, locationId),
  );
}

function edit(
  cookie: string,
  projectId: string,
  location: LocationBody,
  body: Record<string, unknown>,
) {
  return updateLocation(
    jsonRequest(
      `${BASE}/${projectId}/locations/${location.id}/update`,
      cookie,
      {
        name: location.name,
        description: location.description,
        expectedUpdatedAt: location.updatedAt,
        ...body,
      },
    ),
    locationParams(projectId, location.id),
  );
}

function remove(cookie: string, projectId: string, locationId: string) {
  return deleteLocation(
    jsonRequest(
      `${BASE}/${projectId}/locations/${locationId}/delete`,
      cookie,
      {},
    ),
    locationParams(projectId, locationId),
  );
}

describe("Locations HTTP (CM-405)", () => {
  it("adds, lists in order, edits, reorders and deletes", async () => {
    const owner = await ownerWithCompany();
    const projectId = await addProject(owner.workspaceId, owner.userId);
    expect(await names(owner.cookie, projectId)).toEqual([]);

    const chainage = await added(
      owner.cookie,
      projectId,
      "  Chainage 0+000 –  2+500 ",
      "Earthwork and GSB",
    );
    expect(chainage).toMatchObject({
      name: "Chainage 0+000 – 2+500",
      description: "Earthwork and GSB",
      position: 0,
    });
    const culvert = await added(owner.cookie, projectId, "Culvert C3");
    const bridge = await added(owner.cookie, projectId, "Minor bridge MB1");
    expect(await names(owner.cookie, projectId)).toEqual([
      "Chainage 0+000 – 2+500",
      "Culvert C3",
      "Minor bridge MB1",
    ]);

    const edited = await edit(owner.cookie, projectId, culvert, {
      name: "Culvert C3 (box)",
      description: "  ",
    });
    expect(edited.status).toBe(StatusCodes.OK);
    const culvert2 = await json<LocationBody>(edited);
    expect(culvert2).toMatchObject({
      name: "Culvert C3 (box)",
      description: null,
    });
    const stale = await edit(owner.cookie, projectId, culvert, {});
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(stale)).toBe("LOCATION_CHANGED");

    const up = await move(owner.cookie, projectId, bridge.id, "up");
    expect(up.status).toBe(StatusCodes.OK);
    expect(
      (await json<{ items: LocationBody[] }>(up)).items.map((item) => item.id),
    ).toEqual([chainage.id, bridge.id, culvert.id]);
    await move(owner.cookie, projectId, chainage.id, "down");
    expect(await names(owner.cookie, projectId)).toEqual([
      "Minor bridge MB1",
      "Chainage 0+000 – 2+500",
      "Culvert C3 (box)",
    ]);
    // At the bottom, down changes nothing.
    await move(owner.cookie, projectId, culvert.id, "down");
    expect((await names(owner.cookie, projectId)).at(-1)).toBe(
      "Culvert C3 (box)",
    );

    const refused = await deleteProject(
      jsonRequest(`${BASE}/${projectId}/delete`, owner.cookie, {}),
      params(projectId),
    );
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(refused)).toBe("PROJECT_IN_USE");

    expect((await remove(owner.cookie, projectId, bridge.id)).status).toBe(
      StatusCodes.NO_CONTENT,
    );
    const row = await prisma.constructionProjectsLocation.findUnique({
      where: { id: bridge.id },
    });
    expect(row?.deletedAt).not.toBeNull();
    expect(await names(owner.cookie, projectId)).toEqual([
      "Chainage 0+000 – 2+500",
      "Culvert C3 (box)",
    ]);
    const again = await remove(owner.cookie, projectId, bridge.id);
    expect(again.status).toBe(StatusCodes.NOT_FOUND);
    expect(await codeOf(again)).toBe("LOCATION_NOT_FOUND");
    // The deleted name is free again; a new one goes to the end.
    const back = await added(owner.cookie, projectId, "minor bridge mb1");
    expect(back.position).toBeGreaterThan(culvert2.position);
  });

  it("validates the name and description", async () => {
    const owner = await ownerWithCompany();
    const projectId = await addProject(owner.workspaceId, owner.userId);
    await added(owner.cookie, projectId, "Culvert C3");
    for (const [body, status, code] of [
      [{ name: "CULVERT c3" }, StatusCodes.CONFLICT, "LOCATION_NAME_IN_USE"],
      [{ name: " " }, StatusCodes.BAD_REQUEST, "LOCATION_NAME_REQUIRED"],
      [
        { name: "x".repeat(81) },
        StatusCodes.BAD_REQUEST,
        "LOCATION_NAME_TOO_LONG",
      ],
      [
        { name: "Toll plaza", description: "x".repeat(301) },
        StatusCodes.BAD_REQUEST,
        "LOCATION_DESCRIPTION_TOO_LONG",
      ],
    ] as const) {
      const response = await add(owner.cookie, projectId, body);
      expect(response.status, code).toBe(status);
      expect(await codeOf(response)).toBe(code);
    }
    const other = await added(owner.cookie, projectId, "Toll plaza");
    const clash = await edit(owner.cookie, projectId, other, {
      name: "culvert c3",
    });
    expect(clash.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(clash)).toBe("LOCATION_NAME_IN_USE");
  });

  it("follows projects.locations flags and Project visibility", async () => {
    const owner = await ownerWithCompany();
    const road = await addProject(owner.workspaceId, owner.userId);
    const canal = await addProject(owner.workspaceId, owner.userId);
    const culvert = await added(owner.cookie, road, "Culvert C3");
    const assign = (memberId: string, projectIds: string[]) =>
      prisma.constructionOrganizationTeamMemberProject.createMany({
        data: projectIds.map((projectId) => ({ memberId, projectId })),
      });

    const outsider = await memberWith(owner, { "projects.wings": ["read"] });
    await assign(outsider.memberId, [road]);
    for (const response of [
      await list(outsider.cookie, road),
      await add(outsider.cookie, road, { name: "X" }),
    ]) {
      expect(response.status).toBe(StatusCodes.FORBIDDEN);
      expect(await codeOf(response)).toBe("PERMISSION_DENIED");
    }

    const reader = await memberWith(owner, { "projects.locations": ["read"] });
    await assign(reader.memberId, [road]);
    expect(await names(reader.cookie, road)).toEqual(["Culvert C3"]);
    for (const response of [
      await add(reader.cookie, road, { name: "X" }),
      await edit(reader.cookie, road, culvert, { name: "Y" }),
      await move(reader.cookie, road, culvert.id, "down"),
      await remove(reader.cookie, road, culvert.id),
    ])
      expect(response.status).toBe(StatusCodes.FORBIDDEN);

    const creator = await memberWith(owner, {
      "projects.locations": ["create"],
    });
    await assign(creator.memberId, [road]);
    expect((await add(creator.cookie, road, { name: "Toll plaza" })).status).toBe(
      StatusCodes.CREATED,
    );
    expect((await remove(creator.cookie, road, culvert.id)).status).toBe(
      StatusCodes.FORBIDDEN,
    );

    const editor = await memberWith(owner, {
      "projects.locations": ["read", "update", "delete"],
    });
    await assign(editor.memberId, [canal]);
    const hidden = await list(editor.cookie, road);
    expect(hidden.status).toBe(StatusCodes.NOT_FOUND);
    expect(await codeOf(hidden)).toBe("PROJECT_NOT_FOUND");
    expect((await remove(editor.cookie, road, culvert.id)).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    // A Location id under another of the Company's Projects is not found.
    await assign(editor.memberId, [road]);
    const wrongProject = await edit(editor.cookie, canal, culvert, {});
    expect(wrongProject.status).toBe(StatusCodes.NOT_FOUND);
    expect(await codeOf(wrongProject)).toBe("LOCATION_NOT_FOUND");
    expect((await edit(editor.cookie, road, culvert, {})).status).toBe(
      StatusCodes.OK,
    );

    const stranger = await ownerWithCompany("Other Builders");
    for (const response of [
      await list(stranger.cookie, road),
      await add(stranger.cookie, road, { name: "Mine" }),
      await remove(stranger.cookie, road, culvert.id),
    ]) {
      expect(response.status).toBe(StatusCodes.NOT_FOUND);
      expect(await codeOf(response)).toBe("PROJECT_NOT_FOUND");
    }
  });

  it("is listed in OpenAPI", async () => {
    const document = await json<{
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    }>(getOpenApi());
    const item = "/api/construction/projects/projects/{id}/locations";
    for (const [path, method] of [
      [item, "get"],
      [item, "post"],
      [`${item}/{locationId}/update`, "post"],
      [`${item}/{locationId}/move`, "post"],
      [`${item}/{locationId}/delete`, "post"],
    ] as const)
      expect(document.paths[path]?.[method], `${method} ${path}`).toBeDefined();
    expect(
      document.components.schemas["ListConstructionProjectsLocationsResponse"],
    ).toBeDefined();
  });
});
