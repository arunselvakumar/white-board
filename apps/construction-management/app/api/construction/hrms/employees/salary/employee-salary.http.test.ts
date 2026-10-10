import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { POST as createStructureRoute } from "@/app/api/construction/hrms/salary-structures/route";
import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { createSalaryConfigSource } from "@/src/hrms/infrastructure/create-salary-handlers";
import { createTeamMemberHandlers } from "@/src/organization/infrastructure/create-team-member-handlers";
import { jsonRequest, memberWith, ownerWithCompany } from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import { GET as listSalaries } from "./route";
import { POST as saveSalaries } from "./save/route";

const BASE = `${TEST_ORIGIN}/api/construction/hrms/employees/salary`;

type Row = {
  memberId: string;
  name: string;
  memberType: "normal" | "hrms";
  status: "configured" | "not_set";
  config: {
    id: string;
    structureId: string;
    structureName: string | null;
    baseMonthly: number | null;
    componentOverrides: Record<string, unknown> | null;
    gender: string | null;
    uan: string | null;
    esiIpNumber: string | null;
    effectiveFrom: string;
    updatedAt: string;
  } | null;
};

type Listing = {
  items: Row[];
  structures: {
    id: string;
    name: string;
    components: { id: string; name: string }[];
  }[];
  financial: boolean;
};

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

const list = async (cookie: string) =>
  json<Listing>(await listSalaries(jsonRequest(BASE, cookie)));
const save = (cookie: string, rows: unknown[]) =>
  saveSalaries(jsonRequest(`${BASE}/save`, cookie, { rows }));

/** Basic 50% (PF wage), Conveyance ₹1,600, Special the balance. */
async function structure(cookie: string, name = "Site staff") {
  const response = await createStructureRoute(
    jsonRequest(
      `${TEST_ORIGIN}/api/construction/hrms/salary-structures`,
      cookie,
      {
        name,
        description: null,
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
            name: "Conveyance",
            basis: "fixed",
            amount: 160_000,
            percent: null,
            isBalancing: false,
            countsForPfWage: false,
          },
          {
            id: null,
            name: "Special",
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
        esi: { applicable: false, employeePercent: null },
        pt: { applicable: true, monthlyAmount: null },
        deductAbsentDays: true,
        deductUnpaidLeave: true,
        otherDeductions: [],
        isActive: true,
      },
    ),
  );
  expect(response.status).toBe(StatusCodes.CREATED);
  return json<{ id: string; components: { id: string; name: string }[] }>(
    response,
  );
}

/** A Company with its Owner, a Normal and an HRMS Team Member, and a structure. */
async function company(name?: string) {
  const owner = await ownerWithCompany(name);
  const members = createTeamMemberHandlers();
  const normal = await members.invite({
    workspaceId: owner.workspaceId,
    by: owner.userId,
    memberType: "normal",
    details: {
      name: "Bala Normal",
      designationId: owner.designationId("Site Engineer"),
      mobile: `+9196${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`,
    },
  });
  const hrms = await members.invite({
    workspaceId: owner.workspaceId,
    by: owner.userId,
    memberType: "hrms",
    details: {
      name: "Chitra Hrms",
      designationId: owner.designationId("Site Engineer"),
      mobile: `+9195${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`,
    },
  });
  const office = await structure(owner.cookie);
  return { owner, normalId: normal.id, hrmsId: hrms.id, office };
}

function row(
  memberId: string,
  structureId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    memberId,
    structureId,
    baseMonthly: 3_000_000,
    componentOverrides: null,
    gender: null,
    uan: null,
    esiIpNumber: null,
    effectiveFrom: "2026-10-01",
    expectedUpdatedAt: null,
    ...overrides,
  };
}

describe("Employee salary configuration HTTP (CM-315)", () => {
  it("is 401 without a Session", async () => {
    expect((await listSalaries(new Request(BASE))).status).toBe(
      StatusCodes.UNAUTHORIZED,
    );
  });

  it("lists every Normal and HRMS Team Member as Not Set until saved", async () => {
    const { owner, normalId, hrmsId, office } = await company();
    const listing = await list(owner.cookie);
    expect(listing.financial).toBe(true);
    expect(listing.structures.map((item) => item.name)).toEqual(["Site staff"]);
    const byId = new Map(listing.items.map((item) => [item.memberId, item]));
    expect(byId.get(normalId)).toMatchObject({
      memberType: "normal",
      status: "not_set",
      config: null,
    });
    expect(byId.get(hrmsId)).toMatchObject({
      memberType: "hrms",
      status: "not_set",
    });
    expect(listing.items).toHaveLength(3);
    expect(office.components).toHaveLength(3);
  });

  it("saves only the rows sent, with gender, UAN and ESI IP number, audited", async () => {
    const { owner, normalId, hrmsId, office } = await company();
    const response = await save(owner.cookie, [
      row(normalId, office.id, {
        gender: "female",
        uan: "100123456789",
        esiIpNumber: "3112345678",
        componentOverrides: { [office.components[1]?.id ?? ""]: { amount: 0 } },
      }),
      row(hrmsId, office.id, { baseMonthly: 2_000_000 }),
    ]);
    expect(response.status).toBe(StatusCodes.OK);
    const saved = await json<{ items: Row[] }>(response);
    expect(saved.items.map((item) => item.memberId)).toEqual([
      normalId,
      hrmsId,
    ]);
    expect(saved.items[0]).toMatchObject({
      status: "configured",
      config: {
        structureId: office.id,
        structureName: "Site staff",
        baseMonthly: 3_000_000,
        gender: "female",
        uan: "100123456789",
        esiIpNumber: "3112345678",
        effectiveFrom: "2026-10-01",
      },
    });
    const listing = await list(owner.cookie);
    expect(
      listing.items.filter((item) => item.status === "configured"),
    ).toHaveLength(2);
    const audit = await prisma.constructionOrganizationAuditEvent.findMany({
      where: {
        workspaceId: owner.workspaceId,
        action: "employee_salary.configured",
      },
    });
    expect(audit).toHaveLength(2);
    expect(audit.map((event) => event.after)).toContainEqual(
      expect.objectContaining({ memberId: hrmsId, baseMonthly: 2_000_000 }),
    );
  });

  it("updates in place for the same start date and keeps history for a later one", async () => {
    const { owner, normalId, office } = await company();
    const [first] = (
      await json<{ items: Row[] }>(
        await save(owner.cookie, [row(normalId, office.id)]),
      )
    ).items;
    const same = await json<{ items: Row[] }>(
      await save(owner.cookie, [
        row(normalId, office.id, {
          baseMonthly: 3_200_000,
          expectedUpdatedAt: first?.config?.updatedAt,
        }),
      ]),
    );
    expect(same.items[0]?.config?.id).toBe(first?.config?.id);
    const later = await json<{ items: Row[] }>(
      await save(owner.cookie, [
        row(normalId, office.id, {
          baseMonthly: null,
          effectiveFrom: "2027-04-01",
          expectedUpdatedAt: same.items[0]?.config?.updatedAt,
        }),
      ]),
    );
    expect(later.items[0]?.config).toMatchObject({
      baseMonthly: 3_200_000,
      effectiveFrom: "2027-04-01",
    });
    expect(later.items[0]?.config?.id).not.toBe(first?.config?.id);
    expect(
      await prisma.constructionHrmsEmployeeSalaryConfig.count({
        where: { memberId: normalId, deletedAt: null },
      }),
    ).toBe(2);

    // The run reads the row in force for a date (CM-316).
    const source = createSalaryConfigSource();
    const march = await source.inForce(
      owner.workspaceId,
      [normalId],
      "2027-03-31",
    );
    expect(march.get(normalId)?.config.effectiveFrom).toBe("2026-10-01");
    expect(march.get(normalId)?.structure.components).toHaveLength(3);
    const april = await source.inForce(
      owner.workspaceId,
      [normalId],
      "2027-04-30",
    );
    expect(april.get(normalId)?.config.effectiveFrom).toBe("2027-04-01");
    expect(
      (await source.inForce(owner.workspaceId, [normalId], "2026-09-30")).size,
    ).toBe(0);

    const earlier = await save(owner.cookie, [
      row(normalId, office.id, {
        effectiveFrom: "2027-01-01",
        expectedUpdatedAt: later.items[0]?.config?.updatedAt,
      }),
    ]);
    expect(earlier.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(earlier)).toMatchObject({
      code: "EFFECTIVE_FROM_BEFORE_CURRENT",
      details: { memberId: normalId, field: "effectiveFrom" },
    });
  });

  it("refuses stale rows with 409 naming each member, and writes nothing", async () => {
    const { owner, normalId, hrmsId, office } = await company();
    const first = await json<{ items: Row[] }>(
      await save(owner.cookie, [
        row(normalId, office.id),
        row(hrmsId, office.id),
      ]),
    );
    const [normal, hrms] = first.items;
    // Someone else saves the HRMS member.
    expect(
      (
        await save(owner.cookie, [
          row(hrmsId, office.id, {
            baseMonthly: 2_500_000,
            expectedUpdatedAt: hrms?.config?.updatedAt,
          }),
        ])
      ).status,
    ).toBe(StatusCodes.OK);
    const stale = await save(owner.cookie, [
      row(normalId, office.id, {
        baseMonthly: 4_000_000,
        expectedUpdatedAt: normal?.config?.updatedAt,
      }),
      row(hrmsId, office.id, {
        baseMonthly: 9_000_000,
        expectedUpdatedAt: hrms?.config?.updatedAt,
      }),
    ]);
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect(await json(stale)).toMatchObject({
      code: "EMPLOYEE_SALARY_CHANGED",
      details: { memberId: hrmsId, memberIds: [hrmsId] },
    });
    const listing = await list(owner.cookie);
    const byId = new Map(listing.items.map((item) => [item.memberId, item]));
    expect(byId.get(normalId)?.config?.baseMonthly).toBe(3_000_000);
    expect(byId.get(hrmsId)?.config?.baseMonthly).toBe(2_500_000);

    // A Not Set member already configured by someone else is stale too.
    const {
      owner: other,
      normalId: otherId,
      office: otherOffice,
    } = await company("Other Builders");
    await save(other.cookie, [row(otherId, otherOffice.id)]);
    const late = await save(other.cookie, [row(otherId, otherOffice.id)]);
    expect(late.status).toBe(StatusCodes.CONFLICT);
    expect(await json(late)).toMatchObject({
      details: { memberIds: [otherId] },
    });
  });

  it("names the member and the field a broken rule is about", async () => {
    const { owner, normalId, hrmsId, office } = await company();
    const negative = await save(owner.cookie, [
      row(normalId, office.id),
      row(hrmsId, office.id, { baseMonthly: 100_000 }),
    ]);
    expect(negative.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(negative)).toMatchObject({
      code: "BALANCING_COMPONENT_NEGATIVE",
      details: { memberId: hrmsId, field: "baseMonthly" },
    });
    const uan = await save(owner.cookie, [
      row(normalId, office.id, { uan: "123" }),
    ]);
    expect(await json(uan)).toMatchObject({
      code: "UAN_INVALID",
      details: { memberId: normalId, field: "uan" },
    });
    const noBase = await save(owner.cookie, [
      row(normalId, office.id, { baseMonthly: null }),
    ]);
    expect(await json(noBase)).toMatchObject({
      code: "BASE_MONTHLY_REQUIRED",
      details: { memberId: normalId, field: "baseMonthly" },
    });
    const duplicate = await save(owner.cookie, [
      row(normalId, office.id),
      row(normalId, office.id),
    ]);
    expect(await json(duplicate)).toMatchObject({
      code: "EMPLOYEE_SALARY_ROW_DUPLICATE",
      details: { memberId: normalId },
    });
    const shape = await save(owner.cookie, [row(normalId, "not-a-uuid")]);
    expect(shape.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(shape)).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(
      await prisma.constructionHrmsEmployeeSalaryConfig.count({
        where: { workspaceId: owner.workspaceId },
      }),
    ).toBe(0);
  });

  it("hides amounts without financial and lets such a member change the rest", async () => {
    const { owner, normalId, hrmsId, office } = await company();
    const [configured] = (
      await json<{ items: Row[] }>(
        await save(owner.cookie, [row(normalId, office.id)]),
      )
    ).items;

    const reader = await memberWith(owner, { "hrms.employees": ["read"] });
    const listing = await list(reader.cookie);
    expect(listing.financial).toBe(false);
    const seen = listing.items.find((item) => item.memberId === normalId);
    expect(seen?.config).toMatchObject({
      baseMonthly: null,
      componentOverrides: null,
    });
    expect(
      (
        await save(reader.cookie, [
          row(normalId, office.id, {
            baseMonthly: null,
            expectedUpdatedAt: configured?.config?.updatedAt,
          }),
        ])
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);

    const clerk = await memberWith(owner, {
      "hrms.employees": ["read", "update"],
    });
    const amounts = await save(clerk.cookie, [
      row(normalId, office.id, {
        baseMonthly: 9_000_000,
        expectedUpdatedAt: configured?.config?.updatedAt,
      }),
    ]);
    expect(amounts.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json(amounts)).toMatchObject({
      code: "PERMISSION_DENIED",
      details: { memberId: normalId },
    });
    const gender = await save(clerk.cookie, [
      row(normalId, office.id, {
        baseMonthly: null,
        gender: "male",
        expectedUpdatedAt: configured?.config?.updatedAt,
      }),
    ]);
    expect(gender.status).toBe(StatusCodes.OK);
    expect(
      (await json<{ items: Row[] }>(gender)).items[0]?.config,
    ).toMatchObject({
      gender: "male",
      baseMonthly: null,
    });
    const stored =
      await prisma.constructionHrmsEmployeeSalaryConfig.findFirstOrThrow({
        where: { memberId: normalId, deletedAt: null },
      });
    expect(stored.baseMonthly).toBe(3_000_000);

    // Setting up a Not Set member needs create.
    const notSet = await save(clerk.cookie, [
      row(hrmsId, office.id, { baseMonthly: null }),
    ]);
    expect(notSet.status).toBe(StatusCodes.FORBIDDEN);

    const nobody = await memberWith(owner, {
      "hrms.salary_structures": ["read"],
    });
    const denied = await listSalaries(jsonRequest(BASE, nobody.cookie));
    expect(denied.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json(denied)).toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("keeps members and structures of other Companies out", async () => {
    const first = await company("First Builders");
    const second = await company("Second Builders");
    const foreignMember = await save(first.owner.cookie, [
      row(second.normalId, first.office.id),
    ]);
    expect(foreignMember.status).toBe(StatusCodes.NOT_FOUND);
    expect(await json(foreignMember)).toMatchObject({
      code: "TEAM_MEMBER_NOT_FOUND",
      details: { memberId: second.normalId },
    });
    const foreignStructure = await save(first.owner.cookie, [
      row(first.normalId, second.office.id),
    ]);
    expect(foreignStructure.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(foreignStructure)).toMatchObject({
      code: "SALARY_STRUCTURE_NOT_FOUND",
      details: { memberId: first.normalId, field: "structureId" },
    });
    const listing = await list(second.owner.cookie);
    expect(listing.items.map((item) => item.memberId)).not.toContain(
      first.normalId,
    );
  });

  it("is on /api/docs with ConstructionHrms components", async () => {
    const spec = await json<{
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    }>(getOpenApi());
    expect(
      spec.paths["/api/construction/hrms/employees/salary"]?.["get"],
    ).toBeDefined();
    expect(
      spec.paths["/api/construction/hrms/employees/salary/save"]?.["post"],
    ).toBeDefined();
    expect(
      spec.components.schemas["SaveConstructionHrmsEmployeeSalariesRequest"],
    ).toBeDefined();
  });
});
