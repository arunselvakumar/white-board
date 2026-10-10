import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as getProjectDevelopments } from "@/app/api/construction/projects/projects/[id]/developments/route";
import { POST as updateProjectDevelopments } from "@/app/api/construction/projects/projects/[id]/developments/update/route";
import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import {
  SEED_AMENITIES,
  SEED_COMMON_DEVELOPMENTS,
} from "@/src/masters/domain/development-seeds";
import { seedCompanyMasters } from "@/src/masters/infrastructure/seed-company-masters";
import {
  addProject,
  jsonRequest,
  memberWith,
  ownerWithCompany,
} from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import { POST as deleteAmenity } from "./amenities/[id]/delete/route";
import { POST as disableAmenity } from "./amenities/[id]/disable/route";
import { POST as enableAmenity } from "./amenities/[id]/enable/route";
import { POST as assignAmenity } from "./amenities/[id]/projects/route";
import { GET as getAmenity } from "./amenities/[id]/route";
import { POST as updateAmenity } from "./amenities/[id]/update/route";
import { GET as listAmenities, POST as createAmenity } from "./amenities/route";
import {
  GET as listCommonDevelopments,
  POST as createCommonDevelopment,
} from "./common-developments/route";

const BASE = `${TEST_ORIGIN}/api/construction/masters`;
const AMENITIES = `${BASE}/amenities`;
const COMMON = `${BASE}/common-developments`;
const PROJECTS = `${TEST_ORIGIN}/api/construction/projects/projects`;

type Development = {
  id: string;
  name: string;
  isSeed: boolean;
  disabled: boolean;
  projectIds: string[];
  createdAt: string;
  updatedAt: string;
};

type Item = { id: string; name: string; disabled: boolean };

type ProjectDevelopments = {
  amenities: { assigned: Item[]; choices: Item[] };
  commonDevelopments: { assigned: Item[]; choices: Item[] };
};

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function list(
  route: (request: Request) => Promise<Response>,
  url: string,
  cookie: string,
): Promise<Development[]> {
  const response = await route(jsonRequest(url, cookie));
  expect(response.status).toBe(StatusCodes.OK);
  const body = await json<{ items: Development[]; total: number }>(response);
  expect(body.total).toBe(body.items.length);
  return body.items;
}

async function addAmenity(
  cookie: string,
  body: { name: string; projectIds?: string[] },
): Promise<Development> {
  const response = await createAmenity(jsonRequest(AMENITIES, cookie, body));
  expect(response.status).toBe(StatusCodes.CREATED);
  return json<Development>(response);
}

function assign(cookie: string, id: string, projectIds: string[]) {
  return assignAmenity(
    jsonRequest(`${AMENITIES}/${id}/projects`, cookie, { projectIds }),
    params(id),
  );
}

async function projectView(
  cookie: string,
  projectId: string,
): Promise<ProjectDevelopments> {
  const response = await getProjectDevelopments(
    jsonRequest(`${PROJECTS}/${projectId}/developments`, cookie),
    params(projectId),
  );
  expect(response.status).toBe(StatusCodes.OK);
  return json<ProjectDevelopments>(response);
}

function setOnProject(
  cookie: string,
  projectId: string,
  body: { amenityIds?: string[]; commonDevelopmentIds?: string[] },
) {
  return updateProjectDevelopments(
    jsonRequest(`${PROJECTS}/${projectId}/developments/update`, cookie, body),
    params(projectId),
  );
}

/** Puts the Team Member on Projects, as Masters → Team Members does. */
async function putOn(memberId: string, projectIds: string[]): Promise<void> {
  await prisma.constructionOrganizationTeamMemberProject.createMany({
    data: projectIds.map((projectId) => ({ memberId, projectId })),
  });
}

describe("Amenities and Common Developments HTTP (CM-404)", () => {
  it("is 401 without a Session", async () => {
    expect((await listAmenities(new Request(AMENITIES))).status).toBe(
      StatusCodes.UNAUTHORIZED,
    );
    expect((await listCommonDevelopments(new Request(COMMON))).status).toBe(
      StatusCodes.UNAUTHORIZED,
    );
  });

  it("gives a new Company its own seed rows of each kind, once", async () => {
    const owner = await ownerWithCompany();
    const amenities = await list(listAmenities, AMENITIES, owner.cookie);
    expect(amenities.map((item) => item.name)).toEqual(
      [...SEED_AMENITIES].sort((a, b) => a.localeCompare(b)),
    );
    expect(
      amenities.every(
        (item) => item.isSeed && !item.disabled && item.projectIds.length === 0,
      ),
    ).toBe(true);
    const common = await list(listCommonDevelopments, COMMON, owner.cookie);
    expect(common.map((item) => item.name).sort()).toEqual(
      [...SEED_COMMON_DEVELOPMENTS].sort(),
    );

    await seedCompanyMasters(prisma, {
      workspaceId: owner.workspaceId,
      by: owner.userId,
    });
    expect(
      await prisma.constructionMastersDevelopmentType.count({
        where: { workspaceId: owner.workspaceId },
      }),
    ).toBe(SEED_AMENITIES.length + SEED_COMMON_DEVELOPMENTS.length);
  });

  it("adds, renames, disables, enables and deletes; names are unique per kind; seeds are read-only", async () => {
    const owner = await ownerWithCompany();
    const court = await addAmenity(owner.cookie, {
      name: "  Tennis   Court ",
    });
    expect(court).toMatchObject({
      name: "Tennis Court",
      isSeed: false,
      disabled: false,
      projectIds: [],
    });

    const duplicate = await createAmenity(
      jsonRequest(AMENITIES, owner.cookie, { name: "tennis court" }),
    );
    expect(duplicate.status).toBe(StatusCodes.CONFLICT);
    expect(await json(duplicate)).toMatchObject({
      code: "AMENITY_NAME_IN_USE",
    });
    // The same name is free in the other kind.
    const asCommon = await createCommonDevelopment(
      jsonRequest(COMMON, owner.cookie, { name: "Tennis Court" }),
    );
    expect(asCommon.status).toBe(StatusCodes.CREATED);

    const empty = await createAmenity(
      jsonRequest(AMENITIES, owner.cookie, { name: "  " }),
    );
    expect(await json(empty)).toMatchObject({ code: "AMENITY_NAME_REQUIRED" });

    const renamed = await updateAmenity(
      jsonRequest(`${AMENITIES}/${court.id}/update`, owner.cookie, {
        name: "Badminton Court",
        expectedUpdatedAt: court.updatedAt,
      }),
      params(court.id),
    );
    expect(renamed.status).toBe(StatusCodes.OK);
    const stale = await updateAmenity(
      jsonRequest(`${AMENITIES}/${court.id}/update`, owner.cookie, {
        name: "Squash Court",
        expectedUpdatedAt: court.updatedAt,
      }),
      params(court.id),
    );
    expect(await json(stale)).toMatchObject({ code: "AMENITY_CHANGED" });

    const seeds = await list(listAmenities, AMENITIES, owner.cookie);
    const pool = seeds.find((item) => item.name === "Swimming Pool");
    if (pool == null) throw new Error("No seed Swimming Pool");
    const renameSeed = await updateAmenity(
      jsonRequest(`${AMENITIES}/${pool.id}/update`, owner.cookie, {
        name: "Pool",
        expectedUpdatedAt: pool.updatedAt,
      }),
      params(pool.id),
    );
    expect(await json(renameSeed)).toMatchObject({ code: "SEED_IS_READ_ONLY" });
    const deleteSeed = await deleteAmenity(
      jsonRequest(`${AMENITIES}/${pool.id}/delete`, owner.cookie, {}),
      params(pool.id),
    );
    expect(deleteSeed.status).toBe(StatusCodes.CONFLICT);
    const disabled = await disableAmenity(
      jsonRequest(`${AMENITIES}/${pool.id}/disable`, owner.cookie, {}),
      params(pool.id),
    );
    expect(await json(disabled)).toMatchObject({ disabled: true });
    expect(
      (await list(listAmenities, `${AMENITIES}?status=enabled`, owner.cookie))
        .map((item) => item.name)
        .includes("Swimming Pool"),
    ).toBe(false);
    const enabled = await enableAmenity(
      jsonRequest(`${AMENITIES}/${pool.id}/enable`, owner.cookie, {}),
      params(pool.id),
    );
    expect(await json(enabled)).toMatchObject({ disabled: false });

    const deleted = await deleteAmenity(
      jsonRequest(`${AMENITIES}/${court.id}/delete`, owner.cookie, {}),
      params(court.id),
    );
    expect(deleted.status).toBe(StatusCodes.NO_CONTENT);
    const gone = await getAmenity(
      jsonRequest(`${AMENITIES}/${court.id}`, owner.cookie),
      params(court.id),
    );
    expect(gone.status).toBe(StatusCodes.NOT_FOUND);
    expect(await json(gone)).toMatchObject({ code: "AMENITY_NOT_FOUND" });
    // A Common Development is not an Amenity.
    const common = await json<Development>(asCommon);
    const wrongKind = await getAmenity(
      jsonRequest(`${AMENITIES}/${common.id}`, owner.cookie),
      params(common.id),
    );
    expect(wrongKind.status).toBe(StatusCodes.NOT_FOUND);

    const audit = await prisma.constructionOrganizationAuditEvent.findMany({
      where: { workspaceId: owner.workspaceId, entityId: court.id },
      orderBy: { occurredAt: "asc" },
    });
    expect(audit.map((event) => event.action)).toEqual([
      "amenity.created",
      "amenity.updated",
      "amenity.deleted",
    ]);
  });

  it("checks the Permission Matrix per kind", async () => {
    const owner = await ownerWithCompany();
    const reader = await memberWith(owner, {
      "masters.amenities": ["read"],
    });
    expect(
      (await listAmenities(jsonRequest(AMENITIES, reader.cookie))).status,
    ).toBe(StatusCodes.OK);
    expect(
      (await listCommonDevelopments(jsonRequest(COMMON, reader.cookie))).status,
    ).toBe(StatusCodes.FORBIDDEN);
    const create = await createAmenity(
      jsonRequest(AMENITIES, reader.cookie, { name: "Spa" }),
    );
    expect(create.status).toBe(StatusCodes.FORBIDDEN);
    const pool = (await list(listAmenities, AMENITIES, owner.cookie))[0];
    if (pool == null) throw new Error("No seed");
    expect((await assign(reader.cookie, pool.id, [])).status).toBe(
      StatusCodes.FORBIDDEN,
    );
  });

  it("assigns from the master: live Projects only, refuses delete while assigned, disabled rows gain none", async () => {
    const owner = await ownerWithCompany();
    const other = await ownerWithCompany("Sri Balaji Developers");
    const kumari = await addProject(owner.workspaceId, owner.userId, "Kumari");
    const zen = await addProject(owner.workspaceId, owner.userId, "Zen");
    const theirs = await addProject(other.workspaceId, other.userId);

    const court = await addAmenity(owner.cookie, {
      name: "Tennis Court",
      projectIds: [zen],
    });
    expect(court.projectIds).toEqual([zen]);

    const assigned = await assign(owner.cookie, court.id, [zen, kumari, zen]);
    expect(assigned.status).toBe(StatusCodes.OK);
    // By Project name.
    expect((await json<Development>(assigned)).projectIds).toEqual([
      kumari,
      zen,
    ]);

    for (const bad of [[theirs], ["not-a-uuid"]]) {
      const refused = await assign(owner.cookie, court.id, bad);
      expect(refused.status).toBe(StatusCodes.BAD_REQUEST);
      expect(await json(refused)).toMatchObject({
        code: "PROJECT_NOT_FOUND",
      });
    }

    const inUse = await deleteAmenity(
      jsonRequest(`${AMENITIES}/${court.id}/delete`, owner.cookie, {}),
      params(court.id),
    );
    expect(inUse.status).toBe(StatusCodes.CONFLICT);
    expect(await json(inUse)).toMatchObject({ code: "AMENITY_IN_USE" });

    // Disabled: keeps its Projects, may lose one, gains none.
    await disableAmenity(
      jsonRequest(`${AMENITIES}/${court.id}/disable`, owner.cookie, {}),
      params(court.id),
    );
    const kept = await getAmenity(
      jsonRequest(`${AMENITIES}/${court.id}`, owner.cookie),
      params(court.id),
    );
    expect((await json<Development>(kept)).projectIds).toEqual([kumari, zen]);
    expect((await assign(owner.cookie, court.id, [kumari])).status).toBe(
      StatusCodes.OK,
    );
    const gain = await assign(owner.cookie, court.id, [kumari, zen]);
    expect(await json(gain)).toMatchObject({ code: "AMENITY_DISABLED" });

    // A deleted Project no longer counts.
    await prisma.constructionProjectsProject.update({
      where: { id: kumari },
      data: { deletedAt: new Date() },
    });
    const free = await deleteAmenity(
      jsonRequest(`${AMENITIES}/${court.id}/delete`, owner.cookie, {}),
      params(court.id),
    );
    expect(free.status).toBe(StatusCodes.NO_CONTENT);
  });

  it("shows a Member only their Projects and keeps links to the others", async () => {
    const owner = await ownerWithCompany();
    const kumari = await addProject(owner.workspaceId, owner.userId, "Kumari");
    const zen = await addProject(owner.workspaceId, owner.userId, "Zen");
    const member = await memberWith(owner, {
      "masters.amenities": ["read", "update"],
    });
    await putOn(member.memberId, [kumari]);
    const court = await addAmenity(owner.cookie, {
      name: "Tennis Court",
      projectIds: [kumari, zen],
    });

    const seen = await getAmenity(
      jsonRequest(`${AMENITIES}/${court.id}`, member.cookie),
      params(court.id),
    );
    expect((await json<Development>(seen)).projectIds).toEqual([kumari]);

    const hidden = await assign(member.cookie, court.id, [zen]);
    expect(await json(hidden)).toMatchObject({ code: "PROJECT_NOT_FOUND" });

    const cleared = await assign(member.cookie, court.id, []);
    expect((await json<Development>(cleared)).projectIds).toEqual([]);
    const forOwner = await getAmenity(
      jsonRequest(`${AMENITIES}/${court.id}`, owner.cookie),
      params(court.id),
    );
    expect((await json<Development>(forOwner)).projectIds).toEqual([zen]);
  });

  it("assigns from the Project: validates ids per kind, keeps disabled rows it has, checks the Project", async () => {
    const owner = await ownerWithCompany();
    const other = await ownerWithCompany("Sri Balaji Developers");
    const kumari = await addProject(owner.workspaceId, owner.userId, "Kumari");
    const zen = await addProject(owner.workspaceId, owner.userId, "Zen");

    const start = await projectView(owner.cookie, kumari);
    expect(start.amenities.assigned).toEqual([]);
    expect(start.amenities.choices).toHaveLength(SEED_AMENITIES.length);
    expect(start.commonDevelopments.choices).toHaveLength(
      SEED_COMMON_DEVELOPMENTS.length,
    );
    const byName = (items: Item[], name: string) => {
      const found = items.find((item) => item.name === name);
      if (found == null) throw new Error(`No ${name}`);
      return found.id;
    };
    const pool = byName(start.amenities.choices, "Swimming Pool");
    const gym = byName(start.amenities.choices, "Gymnasium");
    const wall = byName(start.commonDevelopments.choices, "Compound Wall");

    const saved = await setOnProject(owner.cookie, kumari, {
      amenityIds: [pool, gym],
      commonDevelopmentIds: [wall],
    });
    expect(saved.status).toBe(StatusCodes.OK);
    const after = await json<ProjectDevelopments>(saved);
    expect(after.amenities.assigned.map((item) => item.name)).toEqual([
      "Gymnasium",
      "Swimming Pool",
    ]);
    expect(after.commonDevelopments.assigned.map((item) => item.id)).toEqual([
      wall,
    ]);
    // The master shows it too; the other Project is untouched.
    const master = await getAmenity(
      jsonRequest(`${AMENITIES}/${pool}`, owner.cookie),
      params(pool),
    );
    expect((await json<Development>(master)).projectIds).toEqual([kumari]);
    expect((await projectView(owner.cookie, zen)).amenities.assigned).toEqual(
      [],
    );

    // A kind left out keeps its rows.
    const onlyAmenities = await json<ProjectDevelopments>(
      await setOnProject(owner.cookie, kumari, { amenityIds: [gym] }),
    );
    expect(onlyAmenities.commonDevelopments.assigned).toHaveLength(1);
    expect(onlyAmenities.amenities.assigned.map((item) => item.id)).toEqual([
      gym,
    ]);

    // A Common Development is not an Amenity; another Company's row neither.
    const theirs = await projectView(
      other.cookie,
      await addProject(other.workspaceId, other.userId),
    );
    for (const bad of [wall, byName(theirs.amenities.choices, "Gymnasium")]) {
      const refused = await setOnProject(owner.cookie, kumari, {
        amenityIds: [bad],
      });
      expect(refused.status).toBe(StatusCodes.BAD_REQUEST);
      expect(await json(refused)).toMatchObject({
        code: "AMENITY_NOT_FOUND",
        details: { ids: [bad] },
      });
    }
    const notUuid = await setOnProject(owner.cookie, kumari, {
      amenityIds: ["pool"],
    });
    expect(notUuid.status).toBe(StatusCodes.BAD_REQUEST);

    // Disabled: stays where it is, cannot be added anywhere new.
    await disableAmenity(
      jsonRequest(`${AMENITIES}/${gym}/disable`, owner.cookie, {}),
      params(gym),
    );
    const view = await projectView(owner.cookie, kumari);
    expect(view.amenities.assigned).toEqual([
      { id: gym, name: "Gymnasium", disabled: true },
    ]);
    expect(view.amenities.choices.some((item) => item.id === gym)).toBe(false);
    expect(
      (await setOnProject(owner.cookie, kumari, { amenityIds: [gym, pool] }))
        .status,
    ).toBe(StatusCodes.OK);
    const addDisabled = await setOnProject(owner.cookie, zen, {
      amenityIds: [gym],
    });
    expect(await json(addDisabled)).toMatchObject({
      code: "AMENITY_DISABLED",
      details: { ids: [gym] },
    });

    // Another Company's Project is not found.
    const foreign = await addProject(other.workspaceId, other.userId);
    const notFound = await getProjectDevelopments(
      jsonRequest(`${PROJECTS}/${foreign}/developments`, owner.cookie),
      params(foreign),
    );
    expect(notFound.status).toBe(StatusCodes.NOT_FOUND);
    expect(
      (await setOnProject(owner.cookie, foreign, { amenityIds: [] })).status,
    ).toBe(StatusCodes.NOT_FOUND);

    const audit = await prisma.constructionOrganizationAuditEvent.findMany({
      where: {
        workspaceId: owner.workspaceId,
        entityId: kumari,
        action: "project.amenity_assigned",
      },
    });
    expect(audit.length).toBeGreaterThanOrEqual(2);
  });

  it("needs the Project menu and the Project for a Member", async () => {
    const owner = await ownerWithCompany();
    const kumari = await addProject(owner.workspaceId, owner.userId, "Kumari");
    const zen = await addProject(owner.workspaceId, owner.userId, "Zen");
    const reader = await memberWith(owner, { "projects.project": ["read"] });
    await putOn(reader.memberId, [kumari]);

    expect(
      (await projectView(reader.cookie, kumari)).amenities.assigned,
    ).toEqual([]);
    const notOn = await getProjectDevelopments(
      jsonRequest(`${PROJECTS}/${zen}/developments`, reader.cookie),
      params(zen),
    );
    expect(notOn.status).toBe(StatusCodes.NOT_FOUND);
    expect(
      (await setOnProject(reader.cookie, kumari, { amenityIds: [] })).status,
    ).toBe(StatusCodes.FORBIDDEN);

    const editor = await memberWith(owner, {
      "projects.project": ["read", "update"],
    });
    await putOn(editor.memberId, [kumari]);
    expect(
      (await setOnProject(editor.cookie, kumari, { amenityIds: [] })).status,
    ).toBe(StatusCodes.OK);
    expect(
      (await setOnProject(editor.cookie, zen, { amenityIds: [] })).status,
    ).toBe(StatusCodes.NOT_FOUND);

    const outsider = await memberWith(owner, {});
    await putOn(outsider.memberId, [kumari]);
    const forbidden = await getProjectDevelopments(
      jsonRequest(`${PROJECTS}/${kumari}/developments`, outsider.cookie),
      params(kumari),
    );
    expect(forbidden.status).toBe(StatusCodes.FORBIDDEN);
  });

  it("is on /api/docs", async () => {
    const spec = await json<{
      paths: Record<string, Record<string, { tags?: string[] }>>;
    }>(getOpenApi());
    for (const kind of ["amenities", "common-developments"]) {
      const path = `/api/construction/masters/${kind}`;
      for (const suffix of [
        "",
        "/{id}",
        "/{id}/update",
        "/{id}/disable",
        "/{id}/enable",
        "/{id}/delete",
        "/{id}/projects",
      ])
        expect(spec.paths[`${path}${suffix}`]).toBeDefined();
    }
    expect(
      spec.paths["/api/construction/projects/projects/{id}/developments"],
    ).toBeDefined();
    expect(
      spec.paths[
        "/api/construction/projects/projects/{id}/developments/update"
      ],
    ).toBeDefined();
  });
});
