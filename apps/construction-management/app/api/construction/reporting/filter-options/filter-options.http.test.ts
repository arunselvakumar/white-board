import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import type { Flag } from "@/src/shared-kernel/access";
import { actAs, addMember, addProject, newCompany } from "@/test/companies";
import {
  addMaterial,
  addMaterialCategory,
  addStore,
  addSupplier,
} from "@/test/procurement";
import { reportPurchaseRequest } from "@/test/procurement-reports";
import { TEST_ORIGIN } from "@/test/sessions";

import type { ListConstructionReportingFilterOptionsResponseModel as Options } from "./filter-options-models";
import { GET as getOptions } from "./route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

const BASE = `${TEST_ORIGIN}/api/construction/reporting/filter-options`;

type Actor = { userId: string; workspaceId: string; role: "owner" | "member" };

async function options(actor: Actor, query: string): Promise<Response> {
  actAs(actor);
  return getOptions(new Request(`${BASE}?${query}`));
}

async function ok(actor: Actor, query: string): Promise<Options> {
  const response = await options(actor, query);
  expect(response.status).toBe(StatusCodes.OK);
  return (await response.json()) as Options;
}

const names = (items: { name: string }[]) => items.map((item) => item.name);

async function setup() {
  const company = await newCompany();
  const ws = company.workspaceId;
  const by = company.ownerId;
  const owner: Actor = { userId: by, workspaceId: ws, role: "owner" };
  const tower = await addProject(ws, by, "Tower A");
  const villa = await addProject(ws, by, "Villa Phase 2");
  await addStore(ws, by, [tower], { name: "Central Store Ambattur" });
  await addSupplier(ws, by, { name: "Sri Murugan Traders" });
  await addMaterialCategory(ws, by, "Steel");
  const sand = await addMaterial(ws, by, { name: "River sand fine" });
  await reportPurchaseRequest(ws, by, {
    projectId: villa,
    requestDate: "2026-09-02",
    lines: [
      {
        materialId: sand.id,
        materialName: sand.name,
        uomId: sand.uomId,
        quantity: "5",
      },
    ],
  });
  const vendorId = randomUUID();
  const now = new Date();
  await prisma.constructionLabourVendor.create({
    data: {
      id: vendorId,
      workspaceId: ws,
      name: "Ganesh Labour Supply",
      joiningDate: now,
      createdAt: now,
      updatedAt: now,
      createdBy: by,
      updatedBy: by,
      projects: { create: [{ projectId: tower }] },
    },
  });
  const member = async (grants: Record<string, Flag[]>) => {
    const added = await addMember(ws, by, grants);
    await prisma.constructionOrganizationTeamMemberProject.create({
      data: { memberId: added.memberId, projectId: tower },
    });
    return { userId: added.userId, workspaceId: ws, role: "member" } as Actor;
  };
  return { ws, by, owner, tower, villa, member };
}

describe("report filter options HTTP (CM-903)", () => {
  it("gives the Owner every picker's choices centrally", async () => {
    const ctx = await setup();
    const central = await ok(ctx.owner, "scope=central");
    expect(names(central.projects)).toEqual(["Tower A", "Villa Phase 2"]);
    expect(names(central.stores)).toEqual(["Central Store Ambattur"]);
    expect(names(central.suppliers)).toContain("Sri Murugan Traders");
    expect(names(central.materialCategories)).toContain("Steel");
    expect(names(central.materials)).toContain("River sand fine");
    expect(names(central.vendors)).toEqual(["Ganesh Labour Supply"]);
    expect(names(central.creators)).toEqual(["Arun Selva Kumar"]);
  });

  it("reads only the pickers of the reports a member may request, and only their Projects", async () => {
    const ctx = await setup();
    const buyer = await ctx.member({
      "procurement.purchase_orders": ["read", "report"],
      "reporting.central_reports": ["read"],
    });
    const central = await ok(buyer, "scope=central");
    expect(names(central.projects)).toEqual(["Tower A"]);
    expect(names(central.suppliers)).toContain("Sri Murugan Traders");
    expect(central.materials).toEqual([]);
    expect(central.vendors).toEqual([]);
    // No Central store Read: no Stores to pick.
    expect(central.stores).toEqual([]);

    // Without Central Reports Read the central cards are not theirs.
    const noCentral = await ctx.member({
      "procurement.purchase_orders": ["read", "report"],
    });
    expect((await ok(noCentral, "scope=central")).suppliers).toEqual([]);

    // A Project's vendors for Vendor Attendance; Created By on Tower only.
    const site = await ctx.member({
      "labour.vendor": ["read", "report"],
      "procurement.purchase_requests": ["read", "report"],
    });
    const tower = await ok(site, `scope=project&projectId=${ctx.tower}`);
    expect(names(tower.vendors)).toEqual(["Ganesh Labour Supply"]);
    expect(tower.creators).toEqual([]);
    expect(tower.projects).toEqual([]);
    const villa = await ok(ctx.owner, `scope=project&projectId=${ctx.villa}`);
    expect(villa.vendors).toEqual([]);
    expect(names(villa.creators)).toEqual(["Arun Selva Kumar"]);
  });

  it("refuses another Company's Project and a bad scope; is on /api/docs", async () => {
    const ctx = await setup();
    const other = await newCompany("Other Builders");
    const foreign = await options(
      { userId: other.ownerId, workspaceId: other.workspaceId, role: "owner" },
      `scope=project&projectId=${ctx.tower}`,
    );
    expect(foreign.status).toBe(StatusCodes.NOT_FOUND);
    // A member on Tower only: Villa answers exactly like a missing Project.
    const site = await ctx.member({ "labour.vendor": ["read", "report"] });
    const offProject = await options(
      site,
      `scope=project&projectId=${ctx.villa}`,
    );
    const missing = await options(
      site,
      `scope=project&projectId=${randomUUID()}`,
    );
    expect(offProject.status).toBe(StatusCodes.NOT_FOUND);
    expect(await offProject.json()).toEqual(await missing.json());
    expect((await options(ctx.owner, "scope=project")).status).toBe(
      StatusCodes.BAD_REQUEST,
    );
    const document = (await getOpenApi().json()) as {
      paths: Record<string, unknown>;
    };
    expect(
      document.paths["/api/construction/reporting/filter-options"],
    ).toBeDefined();
  });
});
