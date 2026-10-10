import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { createMemberFences } from "@/src/hrms/infrastructure/create-hrms-ports";
import {
  addProject,
  jsonRequest,
  memberWith,
  ownerWithCompany,
} from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import { POST as setMembers } from "./[id]/members/route";
import { POST as removeBranch } from "./[id]/remove/route";
import { POST as updateBranch } from "./[id]/update/route";
import { GET as myFences } from "./my-fences/route";
import { GET as projectSites } from "./project-sites/route";
import { GET as listBranches, POST as createBranch } from "./route";

const BASE = `${TEST_ORIGIN}/api/construction/hrms/branches`;

type Branch = {
  id: string;
  kind: string;
  name: string;
  projectId: string | null;
  projectName: string | null;
  latitude: number;
  longitude: number;
  radiusMetres: number;
  memberIds: string[];
  updatedAt: string;
};

const OFFICE = {
  kind: "office_branch",
  name: "Chennai Head Office",
  address: "Anna Salai",
  latitude: 13.0827123456,
  longitude: 80.2707,
  radiusMetres: 150,
};

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

const create = (cookie: string, body: unknown) =>
  createBranch(jsonRequest(BASE, cookie, body));
const list = (cookie: string) => listBranches(jsonRequest(BASE, cookie));
const update = (cookie: string, id: string, body: unknown) =>
  updateBranch(jsonRequest(`${BASE}/${id}/update`, cookie, body), params(id));
const remove = (cookie: string, id: string) =>
  removeBranch(jsonRequest(`${BASE}/${id}/remove`, cookie, {}), params(id));
const link = (cookie: string, id: string, body: unknown) =>
  setMembers(jsonRequest(`${BASE}/${id}/members`, cookie, body), params(id));
const mine = (cookie: string) =>
  myFences(jsonRequest(`${BASE}/my-fences`, cookie));

describe("Branches & Sites HTTP (CM-304)", () => {
  it("is 401 without a Session", async () => {
    expect((await listBranches(new Request(BASE))).status).toBe(
      StatusCodes.UNAUTHORIZED,
    );
  });

  it("adds, lists, edits and removes an office branch, audited", async () => {
    const owner = await ownerWithCompany();
    const created = await create(owner.cookie, OFFICE);
    expect(created.status).toBe(StatusCodes.CREATED);
    const branch = await json<Branch>(created);
    expect(branch).toMatchObject({
      kind: "office_branch",
      name: "Chennai Head Office",
      projectId: null,
      latitude: 13.082712,
      longitude: 80.2707,
      radiusMetres: 150,
      memberIds: [],
    });

    const listed = await json<{
      items: Branch[];
      employees: { name: string }[];
    }>(await list(owner.cookie));
    expect(listed.items.map((item) => item.id)).toEqual([branch.id]);
    expect(listed.employees.map((item) => item.name)).toContain(
      "Arun Selva Kumar",
    );

    const edited = await update(owner.cookie, branch.id, {
      ...OFFICE,
      name: "Chennai HO",
      radiusMetres: 300,
      expectedUpdatedAt: branch.updatedAt,
    });
    expect(edited.status).toBe(StatusCodes.OK);
    expect(await json(edited)).toMatchObject({
      name: "Chennai HO",
      radiusMetres: 300,
    });

    const stale = await update(owner.cookie, branch.id, {
      ...OFFICE,
      expectedUpdatedAt: branch.updatedAt,
    });
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect(await json(stale)).toMatchObject({ code: "BRANCH_CHANGED" });

    expect((await remove(owner.cookie, branch.id)).status).toBe(
      StatusCodes.NO_CONTENT,
    );
    expect(
      (await json<{ items: Branch[] }>(await list(owner.cookie))).items,
    ).toEqual([]);
    expect((await remove(owner.cookie, branch.id)).status).toBe(
      StatusCodes.NOT_FOUND,
    );

    const actions = (
      await prisma.constructionOrganizationAuditEvent.findMany({
        where: { workspaceId: owner.workspaceId, entityId: branch.id },
        orderBy: { occurredAt: "asc" },
      })
    ).map((event) => event.action);
    expect(actions).toEqual([
      "hrms_branch.created",
      "hrms_branch.updated",
      "hrms_branch.removed",
    ]);
  });

  it("names the field a broken rule is about", async () => {
    const owner = await ownerWithCompany();
    const radius = await create(owner.cookie, { ...OFFICE, radiusMetres: 10 });
    expect(radius.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(radius)).toMatchObject({
      code: "BRANCH_RADIUS_INVALID",
      details: { field: "radiusMetres" },
    });
    const latitude = await create(owner.cookie, { ...OFFICE, latitude: 91 });
    expect(await json(latitude)).toMatchObject({
      details: { field: "latitude" },
    });
    const site = await create(owner.cookie, {
      ...OFFICE,
      kind: "project_site",
      name: "Gate 2",
    });
    expect(await json(site)).toMatchObject({
      code: "BRANCH_PROJECT_REQUIRED",
      details: { field: "projectId" },
    });
    const shape = await create(owner.cookie, { ...OFFICE, kind: "warehouse" });
    expect(shape.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(shape)).toMatchObject({ code: "VALIDATION_ERROR" });

    expect((await create(owner.cookie, OFFICE)).status).toBe(
      StatusCodes.CREATED,
    );
    const twin = await create(owner.cookie, {
      ...OFFICE,
      name: "chennai head office",
    });
    expect(twin.status).toBe(StatusCodes.CONFLICT);
    expect(await json(twin)).toMatchObject({ code: "BRANCH_NAME_TAKEN" });
  });

  it("keeps one site fence per Project and lists Projects with theirs", async () => {
    const owner = await ownerWithCompany();
    const tower = await addProject(owner.workspaceId, owner.userId, "Tower A");
    const villas = await addProject(owner.workspaceId, owner.userId, "Villas");
    const site = await create(owner.cookie, {
      ...OFFICE,
      kind: "project_site",
      name: "Main gate",
      projectId: tower,
    });
    expect(site.status).toBe(StatusCodes.CREATED);
    expect(await json(site)).toMatchObject({
      projectId: tower,
      projectName: "Tower A",
    });
    const second = await create(owner.cookie, {
      ...OFFICE,
      kind: "project_site",
      name: "Back gate",
      projectId: tower,
    });
    expect(second.status).toBe(StatusCodes.CONFLICT);
    expect(await json(second)).toMatchObject({ code: "PROJECT_SITE_TAKEN" });

    const sites = await json<{
      items: { project: { name: string }; fence: Branch | null }[];
    }>(await projectSites(jsonRequest(`${BASE}/project-sites`, owner.cookie)));
    expect(
      sites.items.map((item) => [item.project.name, item.fence?.name ?? null]),
    ).toEqual([
      ["Tower A", "Main gate"],
      ["Villas", null],
    ]);
    expect(villas).toBeDefined();

    // Another Company's Project is not ours.
    const other = await ownerWithCompany("Other Builders");
    const theirs = await addProject(other.workspaceId, other.userId);
    const foreign = await create(owner.cookie, {
      ...OFFICE,
      kind: "project_site",
      name: "Theirs",
      projectId: theirs,
    });
    expect(await json(foreign)).toMatchObject({
      code: "BRANCH_PROJECT_NOT_FOUND",
      details: { field: "projectId" },
    });
  });

  it("links members and answers each member's fences", async () => {
    const owner = await ownerWithCompany();
    const project = await addProject(owner.workspaceId, owner.userId, "Tower");
    const linked = await memberWith(owner, { "hrms.attendance": ["read"] });
    const unlinked = await memberWith(owner, { "hrms.attendance": ["read"] });
    await prisma.constructionOrganizationTeamMemberProject.create({
      data: { memberId: linked.memberId, projectId: project },
    });
    const chennai = await json<Branch>(await create(owner.cookie, OFFICE));
    const madurai = await json<Branch>(
      await create(owner.cookie, {
        ...OFFICE,
        name: "Madurai Office",
        latitude: 9.93,
        longitude: 78.12,
      }),
    );
    const site = await json<Branch>(
      await create(owner.cookie, {
        ...OFFICE,
        kind: "project_site",
        name: "Tower gate",
        projectId: project,
      }),
    );

    // No fences configured for linked members yet: every office branch.
    const before = await json<{ items: { id: string }[] }>(
      await mine(unlinked.cookie),
    );
    expect(before.items.map((item) => item.id).sort()).toEqual(
      [chennai.id, madurai.id].sort(),
    );

    const linkedResponse = await link(owner.cookie, madurai.id, {
      memberIds: [linked.memberId],
      expectedUpdatedAt: madurai.updatedAt,
    });
    expect(linkedResponse.status).toBe(StatusCodes.OK);
    const withMembers = await json<Branch>(linkedResponse);
    expect(withMembers.memberIds).toEqual([linked.memberId]);
    const stale = await link(owner.cookie, madurai.id, {
      memberIds: [],
      expectedUpdatedAt: madurai.updatedAt,
    });
    expect(stale.status).toBe(StatusCodes.CONFLICT);

    const own = await json<{ memberId: string; items: { id: string }[] }>(
      await mine(linked.cookie),
    );
    expect(own.memberId).toBe(linked.memberId);
    expect(own.items.map((item) => item.id)).toEqual([madurai.id, site.id]);
    expect(
      (
        await createMemberFences().fencesFor(owner.workspaceId, linked.memberId)
      ).map((fence) => fence.id),
    ).toEqual([madurai.id, site.id]);

    // A site fence takes no members.
    const siteLink = await link(owner.cookie, site.id, {
      memberIds: [linked.memberId],
      expectedUpdatedAt: site.updatedAt,
    });
    expect(await json(siteLink)).toMatchObject({
      code: "BRANCH_MEMBERS_OFFICE_ONLY",
    });

    // Removing the branch unlinks: back to every office branch.
    await remove(owner.cookie, madurai.id);
    const after = await json<{ items: { id: string }[] }>(
      await mine(linked.cookie),
    );
    expect(after.items.map((item) => item.id)).toEqual([chennai.id, site.id]);
  });

  it("needs hrms.settings, and keeps each Company's fences to itself", async () => {
    const owner = await ownerWithCompany();
    const branch = await json<Branch>(await create(owner.cookie, OFFICE));
    const checkInOnly = await memberWith(owner, {
      "hrms.attendance": ["create", "read"],
    });
    for (const response of [
      await list(checkInOnly.cookie),
      await create(checkInOnly.cookie, OFFICE),
    ]) {
      expect(response.status).toBe(StatusCodes.FORBIDDEN);
      expect(await json(response)).toMatchObject({ code: "PERMISSION_DENIED" });
    }
    expect((await mine(checkInOnly.cookie)).status).toBe(StatusCodes.OK);
    const nobody = await memberWith(owner, { "hrms.settings": ["read"] });
    expect((await mine(nobody.cookie)).status).toBe(StatusCodes.FORBIDDEN);
    expect((await list(nobody.cookie)).status).toBe(StatusCodes.OK);
    expect(
      (
        await update(nobody.cookie, branch.id, {
          ...OFFICE,
          expectedUpdatedAt: branch.updatedAt,
        })
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);

    const other = await ownerWithCompany("Other Builders");
    expect(
      (
        await update(other.cookie, branch.id, {
          ...OFFICE,
          expectedUpdatedAt: branch.updatedAt,
        })
      ).status,
    ).toBe(StatusCodes.NOT_FOUND);
    expect((await remove(other.cookie, branch.id)).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    expect(
      (await json<{ items: Branch[] }>(await list(other.cookie))).items,
    ).toEqual([]);
  });

  it("is on /api/docs", async () => {
    const spec = await json<{
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    }>(getOpenApi());
    for (const [path, method] of [
      ["/api/construction/hrms/branches", "get"],
      ["/api/construction/hrms/branches", "post"],
      ["/api/construction/hrms/branches/{id}/update", "post"],
      ["/api/construction/hrms/branches/{id}/remove", "post"],
      ["/api/construction/hrms/branches/{id}/members", "post"],
      ["/api/construction/hrms/branches/my-fences", "get"],
      ["/api/construction/hrms/branches/project-sites", "get"],
    ] as const)
      expect(spec.paths[path]?.[method]).toBeDefined();
    expect(
      spec.components.schemas["CreateConstructionHrmsBranchRequest"],
    ).toBeDefined();
  });
});
