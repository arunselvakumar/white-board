import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { calendarDateToDb } from "@/src/shared-kernel/calendar-date";
import { newId } from "@/src/shared-kernel/ids";
import { jsonRequest, memberWith, ownerWithCompany } from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import { POST as deleteStructure } from "./[id]/delete/route";
import { GET as getStructure } from "./[id]/route";
import { POST as updateStructure } from "./[id]/update/route";
import { GET as listStructures, POST as createStructure } from "./route";
import { GET as getStatutory } from "./statutory/route";

const BASE = `${TEST_ORIGIN}/api/construction/hrms/salary-structures`;

type Structure = {
  id: string;
  name: string;
  components: { id: string; name: string; percent: string | null }[];
  pf: { employeePercent: string | null; wageCeiling: number | null };
  membersUsing: number;
  updatedAt: string;
};

/** Basic 50% (PF wage), HRA 20%, Conveyance ₹1,600, Special the balance. */
function body(overrides: Record<string, unknown> = {}) {
  return {
    name: "Site staff",
    description: "Engineers and supervisors",
    components: [
      {
        id: null,
        name: "Basic",
        basis: "percent_of_base",
        amount: null,
        percent: "50",
        isBalancing: false,
        countsForPfWage: true,
      },
      {
        id: null,
        name: "HRA",
        basis: "percent_of_base",
        amount: null,
        percent: "20",
        isBalancing: false,
        countsForPfWage: false,
      },
      {
        id: null,
        name: "Conveyance",
        basis: "fixed",
        amount: 160_000,
        percent: null,
        isBalancing: false,
        countsForPfWage: false,
      },
      {
        id: null,
        name: "Special Allowance",
        basis: "fixed",
        amount: null,
        percent: null,
        isBalancing: true,
        countsForPfWage: false,
      },
    ],
    pf: {
      applicable: true,
      employeePercent: null,
      capAtCeiling: true,
      wageCeiling: null,
    },
    esi: { applicable: true, employeePercent: null },
    pt: { applicable: true, monthlyAmount: null },
    deductAbsentDays: true,
    deductUnpaidLeave: true,
    otherDeductions: [{ name: "Canteen", amount: 50_000 }],
    isActive: true,
    ...overrides,
  };
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

const create = (cookie: string, payload: unknown = body()) =>
  createStructure(jsonRequest(BASE, cookie, payload));
const list = (cookie: string) => listStructures(jsonRequest(BASE, cookie));
const get = (cookie: string, id: string) =>
  getStructure(jsonRequest(`${BASE}/${id}`, cookie), params(id));
const update = (cookie: string, id: string, payload: unknown) =>
  updateStructure(
    jsonRequest(`${BASE}/${id}/update`, cookie, payload),
    params(id),
  );
const remove = (cookie: string, id: string, expectedUpdatedAt: string) =>
  deleteStructure(
    jsonRequest(`${BASE}/${id}/delete`, cookie, { expectedUpdatedAt }),
    params(id),
  );

describe("Salary structures HTTP (CM-314)", () => {
  it("is 401 without a Session", async () => {
    expect((await listStructures(new Request(BASE))).status).toBe(
      StatusCodes.UNAUTHORIZED,
    );
  });

  it("adds, lists, opens and audits a structure", async () => {
    const owner = await ownerWithCompany();
    const response = await create(owner.cookie);
    expect(response.status).toBe(StatusCodes.CREATED);
    const created = await json<Structure>(response);
    expect(created).toMatchObject({
      name: "Site staff",
      membersUsing: 0,
      components: [
        { name: "Basic", percent: "50" },
        { name: "HRA", percent: "20" },
        { name: "Conveyance", percent: null },
        { name: "Special Allowance", percent: null },
      ],
      otherDeductions: [{ name: "Canteen", amount: 50_000 }],
    });
    expect(await json(await get(owner.cookie, created.id))).toEqual(created);
    expect(await json(await list(owner.cookie))).toEqual({ items: [created] });

    const audit = await prisma.constructionOrganizationAuditEvent.findMany({
      where: {
        workspaceId: owner.workspaceId,
        action: "salary_structure.created",
      },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.entityId).toBe(created.id);
  });

  it("names the field a broken rule is about", async () => {
    const owner = await ownerWithCompany();
    const notHundred = await create(
      owner.cookie,
      body({
        components: [
          {
            id: null,
            name: "Basic",
            basis: "percent_of_base",
            amount: null,
            percent: "60",
            isBalancing: false,
            countsForPfWage: true,
          },
          {
            id: null,
            name: "HRA",
            basis: "percent_of_base",
            amount: null,
            percent: "30",
            isBalancing: false,
            countsForPfWage: false,
          },
        ],
      }),
    );
    expect(notHundred.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(notHundred)).toMatchObject({
      code: "SALARY_COMPONENTS_NOT_100_PERCENT",
      details: { field: "components" },
    });

    const percent = await create(
      owner.cookie,
      body({
        pf: {
          applicable: true,
          employeePercent: "12.345",
          capAtCeiling: true,
          wageCeiling: null,
        },
      }),
    );
    expect(await json(percent)).toMatchObject({
      code: "PF_PERCENT_INVALID",
      details: { field: "pf.employeePercent" },
    });

    const shape = await create(owner.cookie, body({ components: "Basic" }));
    expect(shape.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(shape)).toMatchObject({ code: "VALIDATION_ERROR" });

    expect((await create(owner.cookie)).status).toBe(StatusCodes.CREATED);
    const taken = await create(owner.cookie, body({ name: "site STAFF" }));
    expect(taken.status).toBe(StatusCodes.CONFLICT);
    expect(await json(taken)).toMatchObject({
      code: "SALARY_STRUCTURE_NAME_TAKEN",
      details: { field: "name" },
    });
  });

  it("edits a structure keeping component ids, and refuses a stale edit", async () => {
    const owner = await ownerWithCompany();
    const created = await json<Structure>(await create(owner.cookie));
    const [basic, hra, conveyance, special] = created.components;
    const edit = body({
      name: "Office staff",
      components: [
        { ...body().components[0], id: basic?.id, percent: "40" },
        { ...body().components[3], id: special?.id },
        { ...body().components[1], id: hra?.id },
      ],
      pf: {
        applicable: true,
        employeePercent: "10",
        capAtCeiling: true,
        wageCeiling: 2_100_000,
      },
      expectedUpdatedAt: created.updatedAt,
    });
    const response = await update(owner.cookie, created.id, edit);
    expect(response.status).toBe(StatusCodes.OK);
    const saved = await json<Structure>(response);
    expect(saved.name).toBe("Office staff");
    expect(saved.components.map((item) => [item.id, item.percent])).toEqual([
      [basic?.id, "40"],
      [special?.id, null],
      [hra?.id, "20"],
    ]);
    expect(saved.pf).toMatchObject({
      employeePercent: "10",
      wageCeiling: 2_100_000,
    });
    expect(
      await prisma.constructionHrmsSalaryComponent.count({
        where: { id: conveyance?.id },
      }),
    ).toBe(0);

    const stale = await update(owner.cookie, created.id, edit);
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect(await json(stale)).toMatchObject({
      code: "SALARY_STRUCTURE_CHANGED",
    });

    const foreign = await update(owner.cookie, created.id, {
      ...edit,
      components: [{ ...body().components[3], id: newId() }],
      expectedUpdatedAt: saved.updatedAt,
    });
    expect(foreign.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(foreign)).toMatchObject({
      code: "SALARY_COMPONENT_NOT_FOUND",
      details: { field: "components.0.id" },
    });

    const audit = await prisma.constructionOrganizationAuditEvent.findFirst({
      where: {
        workspaceId: owner.workspaceId,
        action: "salary_structure.updated",
      },
    });
    expect(audit?.before).toMatchObject({ name: "Site staff" });
    expect(audit?.after).toMatchObject({ name: "Office staff" });
  });

  it("refuses deleting a structure in use, then deletes it once free", async () => {
    const owner = await ownerWithCompany();
    const created = await json<Structure>(await create(owner.cookie));
    const ownerMember =
      await prisma.constructionOrganizationTeamMember.findFirstOrThrow({
        where: { workspaceId: owner.workspaceId, isOwner: true },
      });
    const configId = newId();
    await prisma.constructionHrmsEmployeeSalaryConfig.create({
      data: {
        id: configId,
        workspaceId: owner.workspaceId,
        memberId: ownerMember.id,
        structureId: created.id,
        baseMonthly: 3_000_000,
        effectiveFrom: calendarDateToDb("2026-10-01"),
        createdBy: owner.userId,
        updatedBy: owner.userId,
      },
    });
    const inUse = await json<Structure>(await get(owner.cookie, created.id));
    expect(inUse.membersUsing).toBe(1);
    const refused = await remove(owner.cookie, created.id, created.updatedAt);
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect(await json(refused)).toMatchObject({
      code: "SALARY_STRUCTURE_IN_USE",
      details: { members: 1 },
    });

    await prisma.constructionHrmsEmployeeSalaryConfig.update({
      where: { id: configId },
      data: { deletedAt: new Date(), deletedBy: owner.userId },
    });
    const stale = await remove(
      owner.cookie,
      created.id,
      new Date(0).toISOString(),
    );
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect(await json(stale)).toMatchObject({
      code: "SALARY_STRUCTURE_CHANGED",
    });
    const deleted = await remove(owner.cookie, created.id, created.updatedAt);
    expect(deleted.status).toBe(StatusCodes.NO_CONTENT);
    expect((await get(owner.cookie, created.id)).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    expect(await json(await list(owner.cookie))).toEqual({ items: [] });
    // The name is free again.
    expect((await create(owner.cookie)).status).toBe(StatusCodes.CREATED);
  });

  it("needs hrms.salary_structures for each action", async () => {
    const owner = await ownerWithCompany();
    const created = await json<Structure>(await create(owner.cookie));
    const nobody = await memberWith(owner, { "hrms.employees": ["read"] });
    for (const response of [
      await list(nobody.cookie),
      await get(nobody.cookie, created.id),
      await create(nobody.cookie, body({ name: "Other" })),
      await getStatutory(jsonRequest(`${BASE}/statutory`, nobody.cookie)),
    ]) {
      expect(response.status).toBe(StatusCodes.FORBIDDEN);
      expect(await json(response)).toMatchObject({ code: "PERMISSION_DENIED" });
    }
    const reader = await memberWith(owner, {
      "hrms.salary_structures": ["read"],
    });
    expect((await list(reader.cookie)).status).toBe(StatusCodes.OK);
    expect(
      (
        await update(reader.cookie, created.id, {
          ...body(),
          expectedUpdatedAt: created.updatedAt,
        })
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);
    expect(
      (await remove(reader.cookie, created.id, created.updatedAt)).status,
    ).toBe(StatusCodes.FORBIDDEN);
    const editor = await memberWith(owner, {
      "hrms.salary_structures": ["read", "create", "update", "delete"],
    });
    expect((await create(editor.cookie, body({ name: "Other" }))).status).toBe(
      StatusCodes.CREATED,
    );
  });

  it("keeps each Company's structures to itself", async () => {
    const first = await ownerWithCompany("First Builders");
    const second = await ownerWithCompany("Second Builders");
    const created = await json<Structure>(await create(first.cookie));
    expect((await get(second.cookie, created.id)).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    expect(
      (
        await update(second.cookie, created.id, {
          ...body(),
          expectedUpdatedAt: created.updatedAt,
        })
      ).status,
    ).toBe(StatusCodes.NOT_FOUND);
    expect(
      (await remove(second.cookie, created.id, created.updatedAt)).status,
    ).toBe(StatusCodes.NOT_FOUND);
    expect(await json(await list(second.cookie))).toEqual({ items: [] });
    // The same name is the other Company's own.
    expect((await create(second.cookie)).status).toBe(StatusCodes.CREATED);
  });

  it("gives the statutory figures for the sample calculation", async () => {
    const owner = await ownerWithCompany();
    const none = await json<{ ptStateCode: string | null; ptSlabs: unknown[] }>(
      await getStatutory(
        jsonRequest(`${BASE}/statutory?month=2026-10`, owner.cookie),
      ),
    );
    expect(none).toMatchObject({ ptStateCode: null, ptSlabs: [] });
    await prisma.constructionHrmsSettings.create({
      data: {
        id: newId(),
        workspaceId: owner.workspaceId,
        ptStateCode: "27",
        workingDays: [1, 2, 3, 4, 5],
        createdBy: owner.userId,
        updatedBy: owner.userId,
      },
    });
    const response = await getStatutory(
      jsonRequest(`${BASE}/statutory?month=2027-02`, owner.cookie),
    );
    expect(response.status).toBe(StatusCodes.OK);
    const figures = await json<{
      month: string;
      pf: { wageCeiling: number; employeePercent: string };
      esi: { wageCeiling: number };
      ptStateCode: string;
      ptSlabs: { appliesTo: string; grossFrom: number }[];
    }>(response);
    expect(figures).toMatchObject({
      month: "2027-02",
      pf: { wageCeiling: 1_500_000, employeePercent: "12.00" },
      esi: { wageCeiling: 2_100_000 },
      ptStateCode: "27",
    });
    expect(figures.ptSlabs.map((slab) => slab.appliesTo).sort()).toEqual([
      "men",
      "men",
      "women",
    ]);
    const bad = await getStatutory(
      jsonRequest(`${BASE}/statutory?month=2027-13`, owner.cookie),
    );
    expect(bad.status).toBe(StatusCodes.BAD_REQUEST);
  });

  it("is on /api/docs with ConstructionHrms components", async () => {
    const spec = await json<{
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    }>(getOpenApi());
    for (const [path, method] of [
      ["/api/construction/hrms/salary-structures", "get"],
      ["/api/construction/hrms/salary-structures", "post"],
      ["/api/construction/hrms/salary-structures/statutory", "get"],
      ["/api/construction/hrms/salary-structures/{id}", "get"],
      ["/api/construction/hrms/salary-structures/{id}/update", "post"],
      ["/api/construction/hrms/salary-structures/{id}/delete", "post"],
    ] as const)
      expect(spec.paths[path]?.[method]).toBeDefined();
    expect(
      spec.components.schemas["CreateConstructionHrmsSalaryStructureRequest"],
    ).toBeDefined();
    expect(
      spec.components.schemas["ConstructionHrmsSalaryStructureResponse"],
    ).toBeDefined();
  });
});
