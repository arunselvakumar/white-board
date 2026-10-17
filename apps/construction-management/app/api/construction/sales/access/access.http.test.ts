import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { seedProjectSales } from "@/src/sales/infrastructure/seed-project-sales";
import { actAs, addMember, addProject, newCompany } from "@/test/companies";
import { sharedAssign } from "@/test/site-work";

import { GET as getAccess } from "./route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

const BASE = "http://localhost/api/construction/sales/access";

type Access = {
  projectId: string;
  structure: string;
  menus: Record<string, string[]>;
};

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function lists(projectId: string) {
  const where = { projectId, deletedAt: null };
  const [stages, sources, reasons] = await Promise.all([
    prisma.constructionSalesFunnelStage.findMany({
      where,
      orderBy: { sortOrder: "asc" },
    }),
    prisma.constructionSalesLeadSource.findMany({ where }),
    prisma.constructionSalesLostReason.findMany({ where }),
  ]);
  return { stages, sources, reasons };
}

describe("Sales seeds on ProjectCreated (CM-1001, CM-0022 §2)", () => {
  it("adds nothing when run again and keeps a Project's own names", async () => {
    const company = await newCompany();
    const projectId = await addProject(company.workspaceId, company.ownerId);
    await prisma.constructionSalesFunnelStage.create({
      data: {
        id: crypto.randomUUID(),
        workspaceId: company.workspaceId,
        projectId,
        name: "new",
        sortOrder: 1,
        createdBy: company.ownerId,
        updatedBy: company.ownerId,
      },
    });
    const input = {
      workspaceId: company.workspaceId,
      projectId,
      by: company.ownerId,
    };
    await seedProjectSales(prisma, input);
    await seedProjectSales(prisma, input);
    const { stages, sources } = await lists(projectId);
    expect(stages.map((s) => [s.name, s.sortOrder])).toEqual([
      ["new", 1],
      ["Contacted", 2],
      ["Site Visit", 3],
      ["Negotiation", 4],
    ]);
    expect(sources).toHaveLength(6);
  });
});

describe("GET /api/construction/sales/access (CM-1001)", () => {
  it("gives the Owner every flag of both sales menus", async () => {
    const company = await newCompany();
    const projectId = await addProject(company.workspaceId, company.ownerId);
    actAs({ userId: company.ownerId, workspaceId: company.workspaceId });
    const response = await getAccess(
      new Request(`${BASE}?projectId=${projectId}`),
    );
    expect(response.status).toBe(StatusCodes.OK);
    const body = await json<Access>(response);
    expect(body.structure).toBe("wings");
    expect(body.menus["sales.inquiries"]).toEqual(
      expect.arrayContaining(["create", "view_all", "report", "notification"]),
    );
    expect(body.menus["sales.bookings"]).toEqual(
      expect.arrayContaining(["create", "update", "delete", "report"]),
    );
    expect(body.menus["sales.bookings"]).not.toContain("view_all");
  });

  it("gives a member their grants only on a Project they are on", async () => {
    const company = await newCompany();
    const projectId = await addProject(company.workspaceId, company.ownerId);
    const other = await addProject(company.workspaceId, company.ownerId);
    const member = await addMember(company.workspaceId, company.ownerId, {
      "sales.inquiries": ["create", "read"],
    });
    await sharedAssign(member.memberId, projectId);
    actAs({
      userId: member.userId,
      workspaceId: company.workspaceId,
      role: "member",
    });
    const on = await json<Access>(
      await getAccess(new Request(`${BASE}?projectId=${projectId}`)),
    );
    expect(on.menus["sales.inquiries"]).toEqual(["create", "read"]);
    expect(on.menus["sales.bookings"]).toEqual([]);
    const off = await json<Access>(
      await getAccess(new Request(`${BASE}?projectId=${other}`)),
    );
    expect(off.menus["sales.inquiries"]).toEqual([]);
  });

  it("answers 404 for another Company's Project and 400 without one", async () => {
    const company = await newCompany();
    const stranger = await newCompany();
    const projectId = await addProject(stranger.workspaceId, stranger.ownerId);
    actAs({ userId: company.ownerId, workspaceId: company.workspaceId });
    const missing = await getAccess(
      new Request(`${BASE}?projectId=${projectId}`),
    );
    expect(missing.status).toBe(StatusCodes.NOT_FOUND);
    const bad = await getAccess(new Request(BASE));
    expect(bad.status).toBe(StatusCodes.BAD_REQUEST);
  });

  it("is in the OpenAPI document", async () => {
    const document = await json<{ paths: Record<string, unknown> }>(
      getOpenApi(),
    );
    expect(document.paths).toHaveProperty("/api/construction/sales/access");
  });
});
