import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import type { Flag } from "@/src/shared-kernel/access";
import { actAs, addMember, addProject, newCompany } from "@/test/companies";
import { addContractor } from "@/test/procurement";
import {
  reportsEquipment,
  reportsUsageSheet,
  reportsWorksheet,
  worksheetContractor,
  worksheetDepartment,
  worksheetLabourAttendance,
  worksheetLabourCategory,
  worksheetVendorAttendance,
} from "@/test/site-work";
import { TEST_ORIGIN } from "@/test/sessions";

import type {
  GetConstructionSiteWorkDailyWorkDashboardResponseModel as DailyWork,
  GetConstructionSiteWorkEquipmentUsageDashboardResponseModel as EquipmentUsage,
} from "./dashboard-models";
import { GET as dailyWork } from "./daily-work/route";
import { GET as equipmentUsage } from "./equipment-usage/route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

const API = `${TEST_ORIGIN}/api/construction/site-work/dashboard`;
const AUGUST = { from: "2026-08-01", to: "2026-08-31" };

type Actor = {
  userId: string;
  workspaceId: string;
  role: "owner" | "member";
};

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function read(
  route: typeof dailyWork,
  path: string,
  actor: Actor,
  query: Record<string, string>,
) {
  actAs(actor);
  return route(
    new Request(`${API}/${path}?${new URLSearchParams(query).toString()}`),
  );
}

/**
 * Tower A in August: worksheets by two Contractors on two days (and a
 * rejected, a deleted and an out-of-period one), attendance on those
 * days, and usage sheets of an owned JCB, a rented excavator and an owned
 * tipper on trips.
 */
async function seed() {
  const company = await newCompany();
  const ws = company.workspaceId;
  const by = company.ownerId;
  const owner: Actor = { userId: by, workspaceId: ws, role: "owner" };
  const tower = await addProject(ws, by, "Tower A");
  const villa = await addProject(ws, by, "Villa B");
  const masonry = await worksheetDepartment(ws, by, {
    name: "Brick masonry crew",
  });
  const formwork = await worksheetDepartment(ws, by, { name: "Formwork crew" });
  const velan = await worksheetContractor(ws, by, {
    name: "Velan Constructions",
    projectIds: [tower],
    departmentIds: [masonry],
  });
  const murugan = await worksheetContractor(ws, by, {
    name: "Sri Murugan Works",
    projectIds: [tower],
    departmentIds: [formwork],
  });
  const sheet = (input: Parameters<typeof reportsWorksheet>[2]) =>
    reportsWorksheet(ws, by, input);
  await sheet({
    projectId: tower,
    sheetDate: "2026-08-03",
    contractorId: velan,
    departmentId: masonry,
    skilled: 4,
    unskilled: 6,
  });
  await sheet({
    projectId: tower,
    sheetDate: "2026-08-03",
    contractorId: murugan,
    departmentId: formwork,
    skilled: 2,
    unskilled: 1,
    approval: "pending",
  });
  await sheet({
    projectId: tower,
    sheetDate: "2026-08-04",
    contractorId: velan,
    departmentId: masonry,
    skilled: 3,
    unskilled: 5,
    approval: "approved",
  });
  // Left out of the figures.
  await sheet({
    projectId: tower,
    sheetDate: "2026-08-04",
    contractorId: velan,
    departmentId: masonry,
    skilled: 40,
    approval: "rejected",
  });
  await sheet({
    projectId: tower,
    sheetDate: "2026-08-04",
    contractorId: velan,
    departmentId: masonry,
    skilled: 50,
    deleted: true,
  });
  await sheet({
    projectId: villa,
    sheetDate: "2026-08-04",
    contractorId: velan,
    departmentId: masonry,
    skilled: 60,
  });
  // Pending in July: outside the period, still awaiting approval.
  await sheet({
    projectId: tower,
    sheetDate: "2026-07-30",
    contractorId: murugan,
    departmentId: formwork,
    skilled: 70,
    approval: "pending",
  });

  const skilled = await worksheetLabourCategory(ws, by, "skilled");
  const unskilled = await worksheetLabourCategory(ws, by, "unskilled");
  for (const status of ["present", "half_day", "absent"] as const)
    await worksheetLabourAttendance(ws, by, tower, "2026-08-03", {
      categoryId: skilled,
      status,
    });
  await worksheetLabourAttendance(ws, by, tower, "2026-08-03", {
    categoryId: unskilled,
    status: "present",
    deleted: true,
  });
  await worksheetVendorAttendance(ws, by, tower, "2026-08-03", [
    { categoryId: unskilled, fullDay: 8, halfDay: 2 },
  ]);
  await worksheetLabourAttendance(ws, by, tower, "2026-08-05", {
    categoryId: null,
    status: "present",
  });

  const hireParty = await addContractor(ws, by);
  const jcb = await reportsEquipment(ws, by, {
    name: "JCB 3DX",
    projectId: tower,
    placedOn: "2026-07-01",
  });
  const excavator = await reportsEquipment(ws, by, {
    name: "Hired excavator",
    projectId: tower,
    placedOn: "2026-07-01",
    ownership: "rented",
    hirePartyId: hireParty,
    hireBasis: "hourly",
    hireRate: 120_000n,
  });
  const tipper = await reportsEquipment(ws, by, {
    name: "Tipper",
    projectId: tower,
    placedOn: "2026-07-01",
    utilisationBasis: "trip",
  });
  const usage = (input: Parameters<typeof reportsUsageSheet>[2]) =>
    reportsUsageSheet(ws, by, input);
  await usage({
    equipmentId: jcb.id,
    projectId: tower,
    sheetDate: "2026-08-03",
    usageHours: "7.5",
    fuelQty: "40",
  });
  await usage({
    equipmentId: jcb.id,
    projectId: tower,
    sheetDate: "2026-08-04",
    usageHours: "6",
    fuelQty: "30",
    fuelOverrun: true,
  });
  await usage({
    equipmentId: jcb.id,
    projectId: tower,
    sheetDate: "2026-08-05",
    usageHours: "9",
    approval: "rejected",
  });
  await usage({
    equipmentId: excavator.id,
    projectId: tower,
    sheetDate: "2026-08-03",
    ownership: "rented",
    usageHours: "8",
    unitRate: 120_000n,
    billableQty: "8",
    hireCost: 960_000n,
  });
  await usage({
    equipmentId: excavator.id,
    projectId: tower,
    sheetDate: "2026-08-04",
    ownership: "rented",
    usageHours: "4",
    unitRate: 120_000n,
    billableQty: "4",
    hireCost: 480_000n,
  });
  await usage({
    equipmentId: tipper.id,
    projectId: tower,
    sheetDate: "2026-08-04",
    utilisationBasis: "trip",
    trips: 12,
  });
  // Another month and another Project.
  await usage({
    equipmentId: jcb.id,
    projectId: tower,
    sheetDate: "2026-09-01",
    usageHours: "5",
  });
  await usage({
    equipmentId: jcb.id,
    projectId: villa,
    sheetDate: "2026-08-10",
    usageHours: "5",
  });
  return { company, owner, tower, villa, velan, murugan, jcb, excavator };
}

type Seeded = Awaited<ReturnType<typeof seed>>;

async function member(
  s: Seeded,
  grants: Record<string, Flag[]>,
  projectIds: readonly string[],
): Promise<Actor> {
  const added = await addMember(
    s.company.workspaceId,
    s.company.ownerId,
    grants,
  );
  for (const projectId of projectIds)
    await prisma.constructionOrganizationTeamMemberProject.create({
      data: { memberId: added.memberId, projectId },
    });
  return {
    userId: added.userId,
    workspaceId: s.company.workspaceId,
    role: "member",
  };
}

describe("site-work dashboard HTTP (CM-608)", () => {
  it("Daily Work: worksheet labour against attendance, contractor-wise labour and KPIs", async () => {
    const s = await seed();
    const response = await read(dailyWork, "daily-work", s.owner, {
      projectId: s.tower,
      ...AUGUST,
    });
    expect(response.status).toBe(StatusCodes.OK);
    const body = await json<DailyWork>(response);
    expect(body.worksheets).toBe(3);
    expect(body.labourDays).toBe(21);
    // Pending whatever the date: one in August, one in July.
    expect(body.pendingApprovals).toBe(2);
    expect(body.trend).toHaveLength(31);
    const day = (date: string) => body.trend.find((row) => row.date === date);
    // Present + half day (2) + vendor 8 full + 2 half; the deleted row is out.
    expect(day("2026-08-03")).toEqual({
      date: "2026-08-03",
      worksheet: 13,
      attendance: 12,
    });
    expect(day("2026-08-04")).toEqual({
      date: "2026-08-04",
      worksheet: 8,
      attendance: 0,
    });
    expect(day("2026-08-05")).toEqual({
      date: "2026-08-05",
      worksheet: 0,
      attendance: 1,
    });
    expect(
      body.contractors.map((row) => [
        row.contractor,
        row.department,
        row.skilled,
        row.unskilled,
        row.total,
      ]),
    ).toEqual([
      ["Velan Constructions", "Brick masonry crew", 7, 11, 18],
      ["Sri Murugan Works", "Formwork crew", 2, 1, 3],
    ]);
  });

  it("Equipment Usage: top machines by hours, owned vs rented, KPIs; hire cost only with Financial", async () => {
    const s = await seed();
    const body = await json<EquipmentUsage>(
      await read(equipmentUsage, "equipment-usage", s.owner, {
        projectId: s.tower,
        ...AUGUST,
      }),
    );
    expect(body).toMatchObject({
      sheets: 5,
      hours: 25.5,
      km: 0,
      trips: 12,
      fuelOverruns: 1,
      hireCost: 1_440_000,
      ownership: {
        owned: { hours: 13.5, sheets: 2 },
        rented: { hours: 12, sheets: 2 },
      },
    });
    expect(
      body.topEquipment.map((row) => [row.name, row.ownership, row.hours]),
    ).toEqual([
      ["JCB 3DX", "owned", 13.5],
      ["Hired excavator", "rented", 12],
    ]);

    const viewer = await member(
      s,
      {
        "reporting.project_dashboard": ["read"],
        "site_work.equipment_usage": ["read"],
      },
      [s.tower],
    );
    const hidden = await json<EquipmentUsage>(
      await read(equipmentUsage, "equipment-usage", viewer, {
        projectId: s.tower,
        ...AUGUST,
      }),
    );
    expect(hidden.hireCost).toBeNull();
    expect(hidden.hours).toBe(25.5);

    const financial = await member(
      s,
      {
        "reporting.project_dashboard": ["read"],
        "site_work.equipment_usage": ["read", "financial"],
      },
      [s.tower],
    );
    expect(
      (
        await json<EquipmentUsage>(
          await read(equipmentUsage, "equipment-usage", financial, {
            projectId: s.tower,
            ...AUGUST,
          }),
        )
      ).hireCost,
    ).toBe(1_440_000);
  });

  it("an empty period reads zeros", async () => {
    const s = await seed();
    const range = { projectId: s.tower, from: "2026-06-01", to: "2026-06-30" };
    const daily = await json<DailyWork>(
      await read(dailyWork, "daily-work", s.owner, range),
    );
    expect(daily.worksheets).toBe(0);
    expect(daily.contractors).toEqual([]);
    expect(daily.trend.every((row) => row.worksheet === 0)).toBe(true);
    const usage = await json<EquipmentUsage>(
      await read(equipmentUsage, "equipment-usage", s.owner, range),
    );
    expect(usage.sheets).toBe(0);
    expect(usage.topEquipment).toEqual([]);
  });

  it("needs Dashboard Read on the Project and a valid duration", async () => {
    const s = await seed();
    const noDashboard = await member(
      s,
      {
        "site_work.daily_worksheet": ["read"],
        "site_work.equipment_usage": ["read"],
      },
      [s.tower],
    );
    for (const [route, path] of [
      [dailyWork, "daily-work"],
      [equipmentUsage, "equipment-usage"],
    ] as const)
      expect(
        (
          await read(route, path, noDashboard, {
            projectId: s.tower,
            ...AUGUST,
          })
        ).status,
        path,
      ).toBe(StatusCodes.FORBIDDEN);
    const elsewhere = await member(
      s,
      { "reporting.project_dashboard": ["read"] },
      [s.villa],
    );
    expect(
      (
        await read(dailyWork, "daily-work", elsewhere, {
          projectId: s.tower,
          ...AUGUST,
        })
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);
    expect(
      (
        await read(dailyWork, "daily-work", s.owner, {
          projectId: s.tower,
          from: "2026-08-31",
          to: "2026-08-01",
        })
      ).status,
    ).toBe(StatusCodes.BAD_REQUEST);
    expect(
      (
        await read(equipmentUsage, "equipment-usage", s.owner, {
          projectId: s.tower,
          from: "2025-01-01",
          to: "2026-08-01",
        })
      ).status,
    ).toBe(StatusCodes.BAD_REQUEST);
  });

  it("is on /api/docs", async () => {
    const document = await json<{
      paths: Record<string, unknown>;
      components: { schemas: Record<string, unknown> };
    }>(getOpenApi());
    for (const path of [
      "/api/construction/site-work/dashboard/daily-work",
      "/api/construction/site-work/dashboard/equipment-usage",
    ])
      expect(document.paths[path], path).toBeDefined();
    for (const name of [
      "GetConstructionSiteWorkDailyWorkDashboardResponse",
      "GetConstructionSiteWorkEquipmentUsageDashboardResponse",
    ])
      expect(document.components.schemas[name], name).toBeDefined();
  });
});
