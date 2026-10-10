import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { mapError } from "@/app/api/_lib/map-error";
import { HRMS_DEFAULT_GRANTS } from "@/src/shared-kernel/access";
import { createTeamMemberHandlers } from "@/src/organization/infrastructure/create-team-member-handlers";
import { givePlan, jsonRequest, ownerWithCompany } from "@/test/companies";
import { newEmail, signInByEmail, TEST_ORIGIN } from "@/test/sessions";

import { POST as saveSalaries } from "./employees/salary/save/route";
import { GET as listSalaries } from "./employees/salary/route";
import { POST as deleteStructure } from "./salary-structures/[id]/delete/route";
import { POST as updateStructure } from "./salary-structures/[id]/update/route";
import {
  GET as listStructures,
  POST as createStructure,
} from "./salary-structures/route";
import { GET as getStatutory } from "./salary-structures/statutory/route";
import { GET as getSettings } from "./settings/route";
import { POST as updateSettings } from "./settings/update/route";

const HRMS = `${TEST_ORIGIN}/api/construction/hrms`;

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

/** An HRMS Team Member who accepted their Join Request; their session has the Company active. */
async function hrmsMember(owner: Awaited<ReturnType<typeof ownerWithCompany>>) {
  const email = newEmail();
  const member = await createTeamMemberHandlers().invite({
    workspaceId: owner.workspaceId,
    by: owner.userId,
    memberType: "hrms",
    details: {
      name: "Chitra",
      designationId: owner.designationId("Site Engineer"),
      email,
    },
  });
  const session = await signInByEmail(email, "Chitra");
  await prisma.identityWorkspaceMember.create({
    data: {
      id: `member_${member.id}`,
      organizationId: owner.workspaceId,
      userId: session.userId,
      role: "member",
      createdAt: new Date(),
    },
  });
  await prisma.constructionOrganizationTeamMember.update({
    where: { id: member.id },
    data: { status: "active", userId: session.userId, inviteToken: null },
  });
  await prisma.identitySession.updateMany({
    where: { userId: session.userId },
    data: { activeOrganizationId: owner.workspaceId },
  });
  return { ...session, member };
}

const STRUCTURE = {
  name: "Office",
  description: null,
  components: [
    {
      id: null,
      name: "Basic",
      basis: "percent_of_base",
      amount: null,
      percent: "100",
      isBalancing: false,
      countsForPfWage: true,
    },
  ],
  pf: {
    applicable: false,
    employeePercent: null,
    capAtCeiling: true,
    wageCeiling: null,
  },
  esi: { applicable: false, employeePercent: null },
  pt: { applicable: false, monthlyAmount: null },
  deductAbsentDays: true,
  deductUnpaidLeave: true,
  otherDeductions: [],
  isActive: true,
};

const SETTINGS = {
  gpsRequirement: "disabled",
  graceMinutes: 15,
  workingHoursPerDay: 8,
  halfDayHours: 4,
  workingDays: [1, 2, 3, 4, 5],
  leaveApprovalLevels: 1,
  leaveYear: "calendar",
  carryForwardEnabled: false,
  carryForwardMaxDays: null,
  leaveAccrualEnabled: false,
  autoSalaryCalculation: false,
  salaryCalculationDay: null,
  ptStateCode: null,
  expectedUpdatedAt: null,
};

describe("HRMS Team Members (CM-318)", () => {
  it("start with exactly the HRMS default permission set and no Projects", async () => {
    const owner = await ownerWithCompany();
    const { member } = await hrmsMember(owner);
    expect(member.memberType).toBe("hrms");
    expect(member.projectIds).toEqual([]);
    expect(member.permissions).toEqual({
      "hrms.hrms": ["read"],
      "hrms.holidays": ["read"],
      "hrms.attendance": ["create", "read", "notification"],
      "hrms.leaves": ["create", "read", "notification"],
      "hrms.salaries": ["read"],
    });
    expect(member.permissions).toEqual(
      JSON.parse(JSON.stringify(HRMS_DEFAULT_GRANTS)),
    );
  });

  it("cannot open the HRMS configuration routes with the default set", async () => {
    const owner = await ownerWithCompany();
    const created = await json<{ id: string; updatedAt: string }>(
      await createStructure(
        jsonRequest(`${HRMS}/salary-structures`, owner.cookie, STRUCTURE),
      ),
    );
    const { cookie } = await hrmsMember(owner);
    const params = { params: Promise.resolve({ id: created.id }) };
    for (const response of [
      await getSettings(jsonRequest(`${HRMS}/settings`, cookie)),
      await updateSettings(
        jsonRequest(`${HRMS}/settings/update`, cookie, SETTINGS),
      ),
      await listStructures(jsonRequest(`${HRMS}/salary-structures`, cookie)),
      await getStatutory(
        jsonRequest(`${HRMS}/salary-structures/statutory`, cookie),
      ),
      await createStructure(
        jsonRequest(`${HRMS}/salary-structures`, cookie, STRUCTURE),
      ),
      await updateStructure(
        jsonRequest(`${HRMS}/salary-structures/${created.id}/update`, cookie, {
          ...STRUCTURE,
          expectedUpdatedAt: created.updatedAt,
        }),
        params,
      ),
      await deleteStructure(
        jsonRequest(`${HRMS}/salary-structures/${created.id}/delete`, cookie, {
          expectedUpdatedAt: created.updatedAt,
        }),
        params,
      ),
      await listSalaries(jsonRequest(`${HRMS}/employees/salary`, cookie)),
      await saveSalaries(
        jsonRequest(`${HRMS}/employees/salary/save`, cookie, { rows: [] }),
      ),
    ]) {
      expect(response.status).toBe(StatusCodes.FORBIDDEN);
      expect(await json(response)).toMatchObject({ code: "PERMISSION_DENIED" });
    }
  });

  it("are listed as employees beside Normal Team Members", async () => {
    const owner = await ownerWithCompany();
    const { member } = await hrmsMember(owner);
    const listing = await json<{
      items: { memberId: string; memberType: string; active: boolean }[];
    }>(
      await listSalaries(jsonRequest(`${HRMS}/employees/salary`, owner.cookie)),
    );
    expect(listing.items).toContainEqual(
      expect.objectContaining({
        memberId: member.id,
        memberType: "hrms",
        active: true,
      }),
    );
    expect(listing.items.map((item) => item.memberType)).toContain("normal");
  });

  it("switching Normal → HRMS takes an HRMS seat and is refused when none is left", async () => {
    const owner = await ownerWithCompany();
    await givePlan(owner.workspaceId);
    const members = createTeamMemberHandlers();
    const designationId = owner.designationId("Site Engineer");
    const normal = await members.invite({
      workspaceId: owner.workspaceId,
      by: owner.userId,
      memberType: "normal",
      details: { name: "Bala", designationId, mobile: "+919700000001" },
    });
    // Basic has 10 HRMS seats.
    for (let index = 0; index < 10; index += 1)
      await members.invite({
        workspaceId: owner.workspaceId,
        by: owner.userId,
        memberType: "hrms",
        details: {
          name: `Staff ${String(index)}`,
          designationId,
          mobile: `+91970000${String(index + 10).padStart(4, "0")}`,
        },
      });
    const refused = await members
      .update({
        workspaceId: owner.workspaceId,
        id: normal.id,
        by: owner.userId,
        details: { name: "Bala", designationId, mobile: "+919700000001" },
        memberType: "hrms",
      })
      .catch((caught: unknown) => caught);
    const response = mapError(refused);
    expect(response.status).toBe(StatusCodes.PAYMENT_REQUIRED);
    expect(await json(response)).toMatchObject({
      code: "PLAN_LIMIT_EXCEEDED",
      details: { grant: "hrms_member", limit: 10, used: 10 },
    });
    const unchanged = await members.get(owner.workspaceId, normal.id);
    expect(unchanged.memberType).toBe("normal");
  });

  it("an ended plan makes HRMS writes read-only (402) and keeps reads open", async () => {
    const owner = await ownerWithCompany();
    const created = await json<{ id: string; updatedAt: string }>(
      await createStructure(
        jsonRequest(`${HRMS}/salary-structures`, owner.cookie, STRUCTURE),
      ),
    );
    await givePlan(owner.workspaceId, {
      endsAt: new Date(Date.now() - 60_000),
    });
    const params = { params: Promise.resolve({ id: created.id }) };
    const ownerMember =
      await prisma.constructionOrganizationTeamMember.findFirstOrThrow({
        where: { workspaceId: owner.workspaceId, isOwner: true },
      });
    for (const response of [
      await updateSettings(
        jsonRequest(`${HRMS}/settings/update`, owner.cookie, SETTINGS),
      ),
      await createStructure(
        jsonRequest(`${HRMS}/salary-structures`, owner.cookie, {
          ...STRUCTURE,
          name: "Late",
        }),
      ),
      await updateStructure(
        jsonRequest(
          `${HRMS}/salary-structures/${created.id}/update`,
          owner.cookie,
          {
            ...STRUCTURE,
            expectedUpdatedAt: created.updatedAt,
          },
        ),
        params,
      ),
      await deleteStructure(
        jsonRequest(
          `${HRMS}/salary-structures/${created.id}/delete`,
          owner.cookie,
          { expectedUpdatedAt: created.updatedAt },
        ),
        params,
      ),
      await saveSalaries(
        jsonRequest(`${HRMS}/employees/salary/save`, owner.cookie, {
          rows: [
            {
              memberId: ownerMember.id,
              structureId: created.id,
              baseMonthly: 3_000_000,
              componentOverrides: null,
              gender: null,
              uan: null,
              esiIpNumber: null,
              effectiveFrom: "2026-10-01",
              expectedUpdatedAt: null,
            },
          ],
        }),
      ),
    ]) {
      expect(response.status).toBe(StatusCodes.PAYMENT_REQUIRED);
      expect(await json(response)).toMatchObject({ code: "PLAN_EXPIRED" });
    }
    for (const response of [
      await getSettings(jsonRequest(`${HRMS}/settings`, owner.cookie)),
      await listStructures(
        jsonRequest(`${HRMS}/salary-structures`, owner.cookie),
      ),
      await getStatutory(
        jsonRequest(`${HRMS}/salary-structures/statutory`, owner.cookie),
      ),
      await listSalaries(jsonRequest(`${HRMS}/employees/salary`, owner.cookie)),
    ])
      expect(response.status).toBe(StatusCodes.OK);
    expect(
      await prisma.constructionHrmsEmployeeSalaryConfig.count({
        where: { workspaceId: owner.workspaceId },
      }),
    ).toBe(0);
  });
});
