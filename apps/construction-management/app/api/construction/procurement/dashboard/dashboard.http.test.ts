import { randomUUID } from "node:crypto";

import { Prisma, prisma } from "@repo/construction-db";
import { describe, expect, it } from "vitest";

import type { Flag } from "@/src/shared-kernel/access";
import {
  addProject,
  jsonRequest,
  memberWith,
  ownerWithCompany,
} from "@/test/companies";
import {
  addBillingAddress,
  addMaterial,
  addOpeningStock,
  addSupplier,
} from "@/test/procurement";
import { TEST_ORIGIN } from "@/test/sessions";

import type { GetConstructionProcurementDashboardResponseModel } from "./dashboard-models";
import { GET } from "./route";

type Company = Awaited<ReturnType<typeof ownerWithCompany>>;

async function member(
  company: Company,
  permissions: Record<string, Flag[]>,
  projectIds: string[],
) {
  const joined = await memberWith(company, permissions);
  for (const projectId of projectIds)
    await prisma.constructionOrganizationTeamMemberProject.create({
      data: { memberId: joined.memberId, projectId },
    });
  return joined;
}

async function addOrder(
  company: Company,
  projectId: string,
  options: {
    orderDate: string;
    grandTotal: bigint;
    approvalStatus?: "pending" | "approved" | "rejected";
  },
) {
  const supplierId = await addSupplier(company.workspaceId, company.userId, {
    projectIds: [projectId],
  });
  const billingAddressId = await addBillingAddress(
    company.workspaceId,
    company.userId,
  );
  const now = new Date();
  await prisma.constructionProcurementPurchaseOrder.create({
    data: {
      id: randomUUID(),
      workspaceId: company.workspaceId,
      locationKind: "project",
      locationId: projectId,
      number: `PO/${randomUUID().slice(0, 8)}`,
      orderDate: new Date(`${options.orderDate}T00:00:00Z`),
      expectedDeliveryDate: new Date(`${options.orderDate}T00:00:00Z`),
      supplierId,
      supplierName: "Sri Murugan Traders",
      billingAddressId,
      billingName: "Head office",
      billingAddress: "Anna Salai, Chennai",
      grandTotal: options.grandTotal,
      approvalStatus: options.approvalStatus ?? "approved",
      createdAt: now,
      updatedAt: now,
      createdBy: company.userId,
      updatedBy: company.userId,
    },
  });
}

async function read(cookie: string, projectId: string) {
  const response = await GET(
    jsonRequest(
      `${TEST_ORIGIN}/api/construction/procurement/dashboard?projectId=${projectId}&from=2026-04-01&to=2026-06-30`,
      cookie,
    ),
  );
  return {
    status: response.status,
    body: (await response.json()) as GetConstructionProcurementDashboardResponseModel,
  };
}

describe("procurement dashboard (CM-510)", () => {
  it("counts stock states, POs by month and pending approvals", async () => {
    const company = await ownerWithCompany();
    const projectId = await addProject(company.workspaceId, company.userId);
    const site = { kind: "project" as const, id: projectId };
    const { workspaceId, userId } = company;

    const cement = await addMaterial(workspaceId, userId, {
      minStockQty: "50",
    });
    const steel = await addMaterial(workspaceId, userId, {
      minStockQty: "100",
    });
    const sand = await addMaterial(workspaceId, userId);
    const paint = await addMaterial(workspaceId, userId);
    await addOpeningStock(workspaceId, userId, site, cement.id, "120");
    await addOpeningStock(workspaceId, userId, site, steel.id, "80");
    await addOpeningStock(workspaceId, userId, site, sand.id, "5");
    // Paint: only an estimate, no stock — out of stock.
    const now = new Date();
    await prisma.constructionProcurementStockSetting.create({
      data: {
        id: randomUUID(),
        workspaceId,
        locationKind: "project",
        locationId: projectId,
        materialId: paint.id,
        estimatedQty: new Prisma.Decimal("40"),
        createdAt: now,
        updatedAt: now,
        createdBy: userId,
        updatedBy: userId,
      },
    });

    await addOrder(company, projectId, {
      orderDate: "2026-04-10",
      grandTotal: 5_451_600n,
    });
    await addOrder(company, projectId, {
      orderDate: "2026-06-02",
      grandTotal: 1_000_000n,
      approvalStatus: "pending",
    });
    await addOrder(company, projectId, {
      orderDate: "2026-05-15",
      grandTotal: 9_999_999n,
      approvalStatus: "rejected",
    });
    await addOrder(company, projectId, {
      orderDate: "2026-08-01",
      grandTotal: 1n,
    });

    const { status, body } = await read(company.cookie, projectId);
    expect(status).toBe(200);
    expect(body.materials).toEqual({
      total: 4,
      inStock: 2,
      lowStock: 1,
      outOfStock: 1,
    });
    expect(body.purchaseOrders).toEqual({
      count: 2,
      value: 6_451_600,
      months: [
        { month: "2026-04", value: 5_451_600 },
        { month: "2026-05", value: 0 },
        { month: "2026-06", value: 1_000_000 },
      ],
    });
    expect(body.approvals).toEqual({
      purchaseRequests: 0,
      purchaseOrders: 1,
      transfers: 0,
      total: 1,
    });
  });

  it("leaves out what the member may not see, and needs dashboard read", async () => {
    const company = await ownerWithCompany();
    const projectId = await addProject(company.workspaceId, company.userId);
    const viewer = await member(
      company,
      {
        "reporting.project_dashboard": ["read"],
        "procurement.purchase_orders": ["read", "approve"],
      },
      [projectId],
    );
    const { status, body } = await read(viewer.cookie, projectId);
    expect(status).toBe(200);
    expect(body.materials).toBeNull();
    expect(body.purchaseOrders?.count).toBe(0);
    expect(body.approvals).toMatchObject({
      purchaseRequests: null,
      purchaseOrders: 0,
      transfers: null,
    });

    const outsider = await member(
      company,
      { "procurement.purchase_orders": ["read"] },
      [projectId],
    );
    expect((await read(outsider.cookie, projectId)).status).toBe(403);
  });
});
