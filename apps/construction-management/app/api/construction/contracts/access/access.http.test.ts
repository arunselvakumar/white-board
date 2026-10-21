import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { actAs, addMember, addProject, newCompany } from "@/test/companies";
import { sharedAssign } from "@/test/site-work";

import { GET as getAccess } from "./route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

const BASE = "http://localhost/api/construction/contracts/access";

type Access = {
  projectId: string;
  role: string;
  structure: string;
  menus: Record<string, string[]>;
};

async function access(projectId: string): Promise<Access> {
  const response = await getAccess(
    new Request(`${BASE}?projectId=${projectId}`),
  );
  expect(response.status).toBe(StatusCodes.OK);
  return (await response.json()) as Access;
}

describe("GET /api/construction/contracts/access (CM-1101)", () => {
  it("gives the Owner every supported flag of each contracts menu", async () => {
    const company = await newCompany();
    const projectId = await addProject(company.workspaceId, company.ownerId);
    await prisma.constructionProjectsProject.update({
      where: { id: projectId },
      data: { role: "contract" },
    });
    actAs({ userId: company.ownerId, workspaceId: company.workspaceId });
    const body = await access(projectId);
    expect(body).toMatchObject({
      projectId,
      role: "contract",
      structure: "wings",
    });
    expect(Object.keys(body.menus)).toEqual([
      "contracts.boq",
      "contracts.work_orders",
      "contracts.measurements",
      "contracts.contractor_bills",
      "contracts.client_bills",
      "contracts.items",
    ]);
    // BOQ is CRUDAJPNOFEI (CM-0023 §4); Measurement Book has no Financial.
    expect(body.menus["contracts.boq"]).toEqual([
      "create",
      "read",
      "update",
      "delete",
      "approve",
      "reject",
      "print",
      "report",
      "notification",
      "financial",
      "export",
      "import",
    ]);
    expect(body.menus["contracts.measurements"]).not.toContain("financial");
    expect(body.menus["contracts.contractor_bills"]).toContain("notification");
    expect(body.menus["contracts.items"]).toEqual([
      "create",
      "read",
      "update",
      "delete",
      "export",
      "import",
    ]);
  });

  it("gives a member their grants only on a Project they are on; the Item Library everywhere", async () => {
    const company = await newCompany();
    const projectId = await addProject(company.workspaceId, company.ownerId);
    const other = await addProject(company.workspaceId, company.ownerId);
    const member = await addMember(company.workspaceId, company.ownerId, {
      "contracts.measurements": ["create", "read", "approve"],
      "contracts.boq": ["read"],
      "contracts.items": ["read"],
    });
    await sharedAssign(member.memberId, projectId);
    actAs({
      userId: member.userId,
      workspaceId: company.workspaceId,
      role: "member",
    });
    const on = await access(projectId);
    expect(on.role).toBe("own");
    expect(on.menus["contracts.measurements"]).toEqual([
      "create",
      "read",
      "approve",
    ]);
    expect(on.menus["contracts.boq"]).toEqual(["read"]);
    expect(on.menus["contracts.work_orders"]).toEqual([]);
    expect(on.menus["contracts.client_bills"]).toEqual([]);
    expect(on.menus["contracts.items"]).toEqual(["read"]);

    const off = await access(other);
    expect(off.menus["contracts.measurements"]).toEqual([]);
    expect(off.menus["contracts.boq"]).toEqual([]);
    // The Item Library belongs to the Company, not to a Project.
    expect(off.menus["contracts.items"]).toEqual(["read"]);
  });

  it("answers 404 for another Company's Project or a deleted one, and 400 without one", async () => {
    const company = await newCompany();
    const stranger = await newCompany();
    const theirs = await addProject(stranger.workspaceId, stranger.ownerId);
    const deleted = await addProject(company.workspaceId, company.ownerId);
    await prisma.constructionProjectsProject.update({
      where: { id: deleted },
      data: { deletedAt: new Date(), deletedBy: company.ownerId },
    });
    actAs({ userId: company.ownerId, workspaceId: company.workspaceId });
    for (const projectId of [theirs, deleted]) {
      const response = await getAccess(
        new Request(`${BASE}?projectId=${projectId}`),
      );
      expect(response.status).toBe(StatusCodes.NOT_FOUND);
      expect(await response.json()).toMatchObject({
        code: "PROJECT_NOT_FOUND",
      });
    }
    const bad = await getAccess(new Request(BASE));
    expect(bad.status).toBe(StatusCodes.BAD_REQUEST);
  });

  it("answers 401 before it reads the query", async () => {
    actAs({ userId: null, workspaceId: null });
    const response = await getAccess(new Request(`${BASE}?projectId=nope`));
    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
  });

  it("is in the OpenAPI document", async () => {
    const document = (await getOpenApi().json()) as {
      paths: Record<string, unknown>;
      components: { schemas: Record<string, unknown> };
    };
    expect(document.paths).toHaveProperty("/api/construction/contracts/access");
    expect(document.components.schemas).toHaveProperty(
      "GetConstructionContractsAccessResponse",
    );
  });
});
