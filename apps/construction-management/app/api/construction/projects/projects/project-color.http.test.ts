import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { jsonRequest, memberWith, ownerWithCompany } from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import { POST as updateColor } from "./[id]/color/update/route";
import { GET as getProject } from "./[id]/route";
import { POST as createProject } from "./route";

const BASE = `${TEST_ORIGIN}/api/construction/projects/projects`;

type Project = {
  id: string;
  name: string;
  color: string;
  updatedAt: string;
};

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function create(cookie: string, name: string): Promise<Project> {
  const response = await createProject(
    jsonRequest(BASE, cookie, { name, projectType: "residential" }),
  );
  expect(response.status).toBe(StatusCodes.CREATED);
  return json<Project>(response);
}

function setColor(cookie: string, id: string, color: string) {
  return updateColor(
    jsonRequest(`${BASE}/${id}/color/update`, cookie, { color }),
    params(id),
  );
}

async function assign(memberId: string, projectIds: string[]): Promise<void> {
  await prisma.constructionOrganizationTeamMemberProject.createMany({
    data: projectIds.map((projectId) => ({ memberId, projectId })),
  });
}

describe("Change colour HTTP (ADR CM-0026 §5)", () => {
  it("sets the colour alone, audits it, and the same colour again changes nothing", async () => {
    const owner = await ownerWithCompany();
    const kumari = await create(owner.cookie, "Kumari Heights");
    expect(kumari.color).toBe("lavender");

    const response = await setColor(owner.cookie, kumari.id, "mint");
    expect(response.status).toBe(StatusCodes.OK);
    const changed = await json<Project>(response);
    expect(changed).toMatchObject({ name: "Kumari Heights", color: "mint" });
    expect(changed.updatedAt).not.toBe(kumari.updatedAt);
    const read = await json<Project>(
      await getProject(
        jsonRequest(`${BASE}/${kumari.id}`, owner.cookie),
        params(kumari.id),
      ),
    );
    expect(read.color).toBe("mint");

    const again = await json<Project>(
      await setColor(owner.cookie, kumari.id, "mint"),
    );
    expect(again.updatedAt).toBe(changed.updatedAt);

    const audit = await prisma.constructionOrganizationAuditEvent.findMany({
      where: { workspaceId: owner.workspaceId, entityId: kumari.id },
      orderBy: { occurredAt: "asc" },
    });
    expect(audit.map((event) => event.action)).toEqual([
      "project.created",
      "project.updated",
    ]);
    expect(audit[1]?.before).toMatchObject({ color: "lavender" });
    expect(audit[1]?.after).toMatchObject({ color: "mint" });
  });

  it("refuses a colour off the palette with 400 PROJECT_COLOR_INVALID", async () => {
    const owner = await ownerWithCompany();
    const kumari = await create(owner.cookie, "Kumari Heights");
    const response = await setColor(owner.cookie, kumari.id, "#ff0000");
    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(response)).toMatchObject({
      code: "PROJECT_COLOR_INVALID",
    });
  });

  it("is 403 without edit on the Project menu and 404 on a Project not assigned", async () => {
    const owner = await ownerWithCompany();
    const kumari = await create(owner.cookie, "Kumari Heights");
    const tower = await create(owner.cookie, "Asaripallam Tower");

    const readOnly = await memberWith(owner, { "projects.project": ["read"] });
    await assign(readOnly.memberId, [kumari.id]);
    const refused = await setColor(readOnly.cookie, kumari.id, "rose");
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json(refused)).toMatchObject({ code: "PERMISSION_DENIED" });

    const editor = await memberWith(owner, {
      "projects.project": ["read", "update"],
    });
    await assign(editor.memberId, [kumari.id]);
    expect((await setColor(editor.cookie, kumari.id, "rose")).status).toBe(
      StatusCodes.OK,
    );
    const hidden = await setColor(editor.cookie, tower.id, "rose");
    expect(hidden.status).toBe(StatusCodes.NOT_FOUND);
    expect(await json(hidden)).toMatchObject({ code: "PROJECT_NOT_FOUND" });
  });

  it("keeps Companies apart", async () => {
    const first = await ownerWithCompany();
    const second = await ownerWithCompany();
    const kumari = await create(first.cookie, "Kumari Heights");
    const response = await setColor(second.cookie, kumari.id, "sky");
    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });

  it("is on /api/docs", async () => {
    const spec = await json<{
      paths: Record<string, Record<string, { tags?: string[] }>>;
    }>(getOpenApi());
    expect(
      spec.paths["/api/construction/projects/projects/{id}/color/update"]?.[
        "post"
      ]?.tags,
    ).toEqual(["Construction · Projects"]);
  });
});
