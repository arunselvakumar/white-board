import { prisma } from "@repo/db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { POST as assignProjects } from "@/app/api/construction/organization/team-members/[id]/projects/route";
import { POST as createTeamMember } from "@/app/api/construction/organization/team-members/route";
import { GET as getSubscription } from "@/app/api/construction/organization/subscription/route";
import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { newId } from "@/src/shared-kernel/ids";
import {
  givePlan,
  jsonRequest,
  memberWith,
  ownerWithCompany,
} from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import { POST as deleteProject } from "./[id]/delete/route";
import { GET as getProject } from "./[id]/route";
import { POST as updateProject } from "./[id]/update/route";
import { GET as listOptions } from "./options/route";
import { GET as listProjects, POST as createProject } from "./route";

const BASE = `${TEST_ORIGIN}/api/construction/projects/projects`;

type Project = {
  id: string;
  name: string;
  status: "ongoing" | "not_started" | "on_hold" | "completed";
  address: string | null;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
};

type ProjectList = {
  items: Project[];
  total: number;
  counts: Record<"all" | Project["status"], number>;
};

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function create(
  cookie: string,
  body: Record<string, unknown>,
): Promise<Project> {
  const response = await createProject(jsonRequest(BASE, cookie, body));
  expect(response.status).toBe(StatusCodes.CREATED);
  return json<Project>(response);
}

async function list(cookie: string, query = ""): Promise<ProjectList> {
  const response = await listProjects(jsonRequest(`${BASE}${query}`, cookie));
  expect(response.status).toBe(StatusCodes.OK);
  return json<ProjectList>(response);
}

/** Puts the Team Member on Projects, as Masters → Team Members does. */
async function assign(memberId: string, projectIds: string[]): Promise<void> {
  await prisma.constructionOrganizationTeamMemberProject.createMany({
    data: projectIds.map((projectId) => ({ memberId, projectId })),
  });
}

describe("Projects HTTP (CM-204)", () => {
  it("is 401 without a Session", async () => {
    expect((await listProjects(new Request(BASE))).status).toBe(
      StatusCodes.UNAUTHORIZED,
    );
    expect((await listOptions(new Request(`${BASE}/options`))).status).toBe(
      StatusCodes.UNAUTHORIZED,
    );
  });

  it("adds, lists by status with counts, reads, edits and deletes", async () => {
    const owner = await ownerWithCompany();
    expect(await list(owner.cookie)).toEqual({
      items: [],
      total: 0,
      counts: { all: 0, ongoing: 0, not_started: 0, on_hold: 0, completed: 0 },
    });

    const kumari = await create(owner.cookie, {
      name: "  Kumari   Heights ",
      address: "Plot 12, Vadasery, Nagercoil",
      startDate: "2026-04-01",
      endDate: "2027-03-31",
    });
    expect(kumari).toMatchObject({
      name: "Kumari Heights",
      status: "ongoing",
      address: "Plot 12, Vadasery, Nagercoil",
      startDate: "2026-04-01",
      endDate: "2027-03-31",
    });
    await create(owner.cookie, { name: "Zen Villas", status: "completed" });
    await create(owner.cookie, { name: "Asaripallam Tower" });
    await create(owner.cookie, {
      name: "Vadasery Plots",
      status: "not_started",
    });

    const all = await list(owner.cookie);
    expect(all.items.map((item) => item.name)).toEqual([
      "Asaripallam Tower",
      "Kumari Heights",
      "Vadasery Plots",
      "Zen Villas",
    ]);
    expect(all.counts).toEqual({
      all: 4,
      ongoing: 2,
      not_started: 1,
      on_hold: 0,
      completed: 1,
    });
    const completed = await list(owner.cookie, "?status=completed");
    expect(completed.items.map((item) => item.name)).toEqual(["Zen Villas"]);
    expect(completed.total).toBe(1);
    expect(completed.counts.all).toBe(4);
    expect(
      (
        await listProjects(
          jsonRequest(`${BASE}?status=cancelled`, owner.cookie),
        )
      ).status,
    ).toBe(StatusCodes.BAD_REQUEST);

    const read = await getProject(
      jsonRequest(`${BASE}/${kumari.id}`, owner.cookie),
      params(kumari.id),
    );
    expect(await json<Project>(read)).toEqual(kumari);

    const updated = await updateProject(
      jsonRequest(`${BASE}/${kumari.id}/update`, owner.cookie, {
        name: "Kumari Heights",
        status: "on_hold",
        address: "",
        startDate: "2026-04-01",
        endDate: null,
        expectedUpdatedAt: kumari.updatedAt,
      }),
      params(kumari.id),
    );
    expect(updated.status).toBe(StatusCodes.OK);
    const after = await json<Project>(updated);
    expect(after).toMatchObject({
      status: "on_hold",
      address: null,
      endDate: null,
    });

    const audits = await prisma.constructionOrganizationAuditEvent.findMany({
      where: { workspaceId: owner.workspaceId, entityId: kumari.id },
      orderBy: { occurredAt: "asc" },
    });
    expect(audits.map((item) => item.action)).toEqual([
      "project.created",
      "project.updated",
    ]);
    expect(audits[1]?.before).toMatchObject({ status: "ongoing" });
    expect(audits[1]?.after).toMatchObject({ status: "on_hold" });

    const deleted = await deleteProject(
      jsonRequest(`${BASE}/${kumari.id}/delete`, owner.cookie, {}),
      params(kumari.id),
    );
    expect(deleted.status).toBe(StatusCodes.NO_CONTENT);
    const row = await prisma.constructionProjectsProject.findUnique({
      where: { id: kumari.id },
    });
    expect(row?.deletedAt).not.toBeNull();
    expect(row?.deletedBy).toBe(owner.userId);
    expect(
      (
        await getProject(
          jsonRequest(`${BASE}/${kumari.id}`, owner.cookie),
          params(kumari.id),
        )
      ).status,
    ).toBe(StatusCodes.NOT_FOUND);
    expect((await list(owner.cookie)).total).toBe(3);
    // A deleted Project's name is free again.
    await create(owner.cookie, { name: "Kumari Heights" });
  });

  it("validates the form: name, name in use, dates", async () => {
    const owner = await ownerWithCompany();
    await create(owner.cookie, { name: "Kumari Heights" });
    const attempt = async (body: Record<string, unknown>) => {
      const response = await createProject(
        jsonRequest(BASE, owner.cookie, body),
      );
      return {
        status: response.status,
        body: await json<{ code: string }>(response),
      };
    };
    expect(await attempt({ name: "  " })).toMatchObject({
      status: StatusCodes.BAD_REQUEST,
      body: { code: "PROJECT_NAME_REQUIRED" },
    });
    expect(await attempt({ name: "x".repeat(121) })).toMatchObject({
      status: StatusCodes.BAD_REQUEST,
      body: { code: "PROJECT_NAME_TOO_LONG" },
    });
    expect(await attempt({ name: "kumari heights" })).toMatchObject({
      status: StatusCodes.CONFLICT,
      body: { code: "PROJECT_NAME_IN_USE" },
    });
    expect(
      await attempt({
        name: "Asaripallam Tower",
        startDate: "2026-10-08",
        endDate: "2026-10-01",
      }),
    ).toMatchObject({
      status: StatusCodes.BAD_REQUEST,
      body: { code: "PROJECT_DATES_INVALID" },
    });
    expect(
      await attempt({ name: "Asaripallam Tower", startDate: "2026-02-30" }),
    ).toMatchObject({
      status: StatusCodes.BAD_REQUEST,
      body: { code: "PROJECT_DATE_INVALID" },
    });
    expect(
      await attempt({ name: "Asaripallam Tower", status: "done" }),
    ).toMatchObject({
      status: StatusCodes.BAD_REQUEST,
      body: { code: "VALIDATION_ERROR" },
    });
  });

  it("refuses a stale edit with 409 PROJECT_CHANGED and a rename onto another Project", async () => {
    const owner = await ownerWithCompany();
    const kumari = await create(owner.cookie, { name: "Kumari Heights" });
    await create(owner.cookie, { name: "Asaripallam Tower" });
    const edit = (body: Record<string, unknown>) =>
      updateProject(
        jsonRequest(`${BASE}/${kumari.id}/update`, owner.cookie, {
          name: "Kumari Heights",
          status: "ongoing",
          ...body,
        }),
        params(kumari.id),
      );
    const first = await edit({
      status: "completed",
      expectedUpdatedAt: kumari.updatedAt,
    });
    expect(first.status).toBe(StatusCodes.OK);
    const stale = await edit({
      status: "on_hold",
      expectedUpdatedAt: kumari.updatedAt,
    });
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect(await json(stale)).toMatchObject({ code: "PROJECT_CHANGED" });
    const fresh = await json<Project>(first);
    const clash = await edit({
      name: "Asaripallam Tower",
      expectedUpdatedAt: fresh.updatedAt,
    });
    expect(clash.status).toBe(StatusCodes.CONFLICT);
    expect(await json(clash)).toMatchObject({ code: "PROJECT_NAME_IN_USE" });
  });

  it("refuses a Project beyond the plan with 402 and counts Projects as usage", async () => {
    const owner = await ownerWithCompany();
    await givePlan(owner.workspaceId);
    await create(owner.cookie, { name: "Project 1" });
    // Basic allows 10 Projects; fill the rest directly.
    const now = new Date();
    await prisma.constructionProjectsProject.createMany({
      data: Array.from({ length: 9 }, (_, index) => ({
        id: newId(),
        workspaceId: owner.workspaceId,
        name: `Project ${String(index + 2)}`,
        createdAt: now,
        updatedAt: now,
        createdBy: owner.userId,
        updatedBy: owner.userId,
      })),
    });
    const refused = await createProject(
      jsonRequest(BASE, owner.cookie, { name: "Project 11" }),
    );
    expect(refused.status).toBe(StatusCodes.PAYMENT_REQUIRED);
    expect(await json(refused)).toMatchObject({
      code: "PLAN_LIMIT_EXCEEDED",
      details: { grant: "project", limit: 10, used: 10 },
    });

    const subscription = await json<{
      usage: { grant: string; used: number; limit: number }[];
    }>(
      await getSubscription(
        jsonRequest(
          `${TEST_ORIGIN}/api/construction/organization/subscription`,
          owner.cookie,
        ),
      ),
    );
    expect(subscription.usage.find((item) => item.grant === "project")).toEqual(
      { grant: "project", used: 10, limit: 10 },
    );

    // A deleted Project frees its place.
    const first = (await list(owner.cookie)).items.find(
      (item) => item.name === "Project 1",
    );
    await deleteProject(
      jsonRequest(`${BASE}/${first?.id ?? ""}/delete`, owner.cookie, {}),
      params(first?.id ?? ""),
    );
    await create(owner.cookie, { name: "Project 11" });
  });

  it("refuses to delete a Project while a labour works on it", async () => {
    const owner = await ownerWithCompany();
    const kumari = await create(owner.cookie, { name: "Kumari Heights" });
    const labourId = newId();
    await prisma.$executeRaw`
      INSERT INTO construction_labour.labours
        (id, workspace_id, name, joining_date, wage_type, wage_per_day,
         overtime_wage_per_hour, current_project_id, created_by, updated_by)
      VALUES
        (${labourId}::uuid, ${owner.workspaceId}, 'Ramu', DATE '2026-10-01',
         'daily', 70000, 10000, ${kumari.id}::uuid, ${owner.userId}, ${owner.userId})
    `;
    const refused = await deleteProject(
      jsonRequest(`${BASE}/${kumari.id}/delete`, owner.cookie, {}),
      params(kumari.id),
    );
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect(await json(refused)).toMatchObject({ code: "PROJECT_IN_USE" });

    await prisma.$executeRaw`
      UPDATE construction_labour.labours SET deleted_at = now()
      WHERE id = ${labourId}::uuid
    `;
    const allowed = await deleteProject(
      jsonRequest(`${BASE}/${kumari.id}/delete`, owner.cookie, {}),
      params(kumari.id),
    );
    expect(allowed.status).toBe(StatusCodes.NO_CONTENT);
  });

  it("shows a Member only their Projects; others are 404 to them", async () => {
    const owner = await ownerWithCompany();
    const kumari = await create(owner.cookie, { name: "Kumari Heights" });
    const asaripallam = await create(owner.cookie, {
      name: "Asaripallam Tower",
    });
    const member = await memberWith(owner, {
      "projects.project": ["create", "read", "update", "delete"],
    });
    await assign(member.memberId, [kumari.id]);

    const page = await list(member.cookie);
    expect(page.items.map((item) => item.name)).toEqual(["Kumari Heights"]);
    expect(page.counts.all).toBe(1);
    const options = await json<{ items: unknown[] }>(
      await listOptions(jsonRequest(`${BASE}/options`, member.cookie)),
    );
    expect(options.items).toEqual([
      { id: kumari.id, name: "Kumari Heights", status: "ongoing" },
    ]);

    expect(
      (
        await getProject(
          jsonRequest(`${BASE}/${kumari.id}`, member.cookie),
          params(kumari.id),
        )
      ).status,
    ).toBe(StatusCodes.OK);
    expect(
      (
        await getProject(
          jsonRequest(`${BASE}/${asaripallam.id}`, member.cookie),
          params(asaripallam.id),
        )
      ).status,
    ).toBe(StatusCodes.NOT_FOUND);
    const editOther = await updateProject(
      jsonRequest(`${BASE}/${asaripallam.id}/update`, member.cookie, {
        name: "Asaripallam Tower",
        status: "completed",
        expectedUpdatedAt: asaripallam.updatedAt,
      }),
      params(asaripallam.id),
    );
    expect(editOther.status).toBe(StatusCodes.NOT_FOUND);
    expect(
      (
        await deleteProject(
          jsonRequest(`${BASE}/${asaripallam.id}/delete`, member.cookie, {}),
          params(asaripallam.id),
        )
      ).status,
    ).toBe(StatusCodes.NOT_FOUND);
    const editMine = await updateProject(
      jsonRequest(`${BASE}/${kumari.id}/update`, member.cookie, {
        name: "Kumari Heights",
        status: "on_hold",
        expectedUpdatedAt: kumari.updatedAt,
      }),
      params(kumari.id),
    );
    expect(editMine.status).toBe(StatusCodes.OK);

    // A Member who adds a Project is not assigned to it.
    await create(member.cookie, { name: "Parvathipuram Row Houses" });
    expect((await list(member.cookie)).total).toBe(1);
    expect((await list(owner.cookie)).total).toBe(3);
  });

  it("is 403 for a Member without the Project menu, yet the picker stays open", async () => {
    const owner = await ownerWithCompany();
    const kumari = await create(owner.cookie, { name: "Kumari Heights" });
    const member = await memberWith(owner, {
      "organization.team_members": ["read"],
    });
    await assign(member.memberId, [kumari.id]);
    for (const response of [
      await listProjects(jsonRequest(BASE, member.cookie)),
      await createProject(
        jsonRequest(BASE, member.cookie, { name: "Asaripallam Tower" }),
      ),
      await getProject(
        jsonRequest(`${BASE}/${kumari.id}`, member.cookie),
        params(kumari.id),
      ),
    ]) {
      expect(response.status).toBe(StatusCodes.FORBIDDEN);
      expect(await json(response)).toMatchObject({ code: "PERMISSION_DENIED" });
    }
    const readOnly = await memberWith(owner, { "projects.project": ["read"] });
    await assign(readOnly.memberId, [kumari.id]);
    const edit = await updateProject(
      jsonRequest(`${BASE}/${kumari.id}/update`, readOnly.cookie, {
        name: "Kumari Heights",
        status: "completed",
        expectedUpdatedAt: kumari.updatedAt,
      }),
      params(kumari.id),
    );
    expect(edit.status).toBe(StatusCodes.FORBIDDEN);

    const options = await json<{ items: { id: string }[] }>(
      await listOptions(jsonRequest(`${BASE}/options`, member.cookie)),
    );
    expect(options.items.map((item) => item.id)).toEqual([kumari.id]);
  });

  it("keeps Companies apart", async () => {
    const anugraha = await ownerWithCompany("Anugraha Engineers");
    const sakthi = await ownerWithCompany("Sakthi Constructions");
    const kumari = await create(anugraha.cookie, { name: "Kumari Heights" });
    // The same name is fine in another Company.
    await create(sakthi.cookie, { name: "Kumari Heights" });
    expect((await list(sakthi.cookie)).total).toBe(1);
    expect(
      (
        await getProject(
          jsonRequest(`${BASE}/${kumari.id}`, sakthi.cookie),
          params(kumari.id),
        )
      ).status,
    ).toBe(StatusCodes.NOT_FOUND);
    expect(
      (
        await deleteProject(
          jsonRequest(`${BASE}/${kumari.id}/delete`, sakthi.cookie, {}),
          params(kumari.id),
        )
      ).status,
    ).toBe(StatusCodes.NOT_FOUND);
    const options = await json<{ items: { id: string }[] }>(
      await listOptions(jsonRequest(`${BASE}/options`, sakthi.cookie)),
    );
    expect(options.items.map((item) => item.id)).not.toContain(kumari.id);
  });

  it("checks Team Member Project assignments against live Projects", async () => {
    const owner = await ownerWithCompany();
    const other = await ownerWithCompany("Sakthi Constructions");
    const kumari = await create(owner.cookie, { name: "Kumari Heights" });
    const foreign = await create(other.cookie, { name: "Asaripallam Tower" });
    const members = `${TEST_ORIGIN}/api/construction/organization/team-members`;
    const add = (projectIds: string[]) =>
      createTeamMember(
        jsonRequest(members, owner.cookie, {
          name: "Prabhu Saravanan",
          designationId: owner.designationId("Site Engineer"),
          email: `prabhu-${newId()}@example.test`,
          memberType: "normal",
          projectIds,
        }),
      );
    const refused = await add([foreign.id]);
    expect(refused.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(refused)).toMatchObject({
      code: "PROJECT_NOT_FOUND",
      details: { projectIds: [foreign.id] },
    });
    const added = await add([kumari.id]);
    expect(added.status).toBe(StatusCodes.CREATED);
    const member = await json<{ id: string; projectIds: string[] }>(added);
    expect(member.projectIds).toEqual([kumari.id]);

    const reassign = (projectIds: string[]) =>
      assignProjects(
        jsonRequest(`${members}/${member.id}/projects`, owner.cookie, {
          projectIds,
        }),
        params(member.id),
      );
    expect((await reassign(["not-a-project"])).status).toBe(
      StatusCodes.BAD_REQUEST,
    );
    expect((await reassign([])).status).toBe(StatusCodes.OK);
  });

  it("lists every projects route on /api/docs", async () => {
    const spec = await json<{
      paths: Record<string, Record<string, { tags?: string[] }>>;
    }>(getOpenApi());
    for (const [path, method] of [
      ["/api/construction/projects/projects", "get"],
      ["/api/construction/projects/projects", "post"],
      ["/api/construction/projects/projects/options", "get"],
      ["/api/construction/projects/projects/custom-field-labels", "get"],
      ["/api/construction/projects/projects/{id}", "get"],
      ["/api/construction/projects/projects/{id}/update", "post"],
      ["/api/construction/projects/projects/{id}/delete", "post"],
    ] as const)
      expect(spec.paths[path]?.[method]?.tags).toEqual([
        "Construction · Projects",
      ]);
  });
});
