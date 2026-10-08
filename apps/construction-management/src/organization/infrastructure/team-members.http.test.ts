import { randomUUID } from "node:crypto";

import { prisma } from "@repo/db";
import { describe, expect, it } from "vitest";

import { can } from "@/src/shared-kernel/access";
import { loadMemberAccess } from "@/src/shared-kernel/access/prisma-access-reader";

import { createCompanyHandlers } from "./create-company-handlers";
import { createDesignationHandlers } from "./create-designation-handlers";
import { createTeamMemberHandlers } from "./create-team-member-handlers";

async function newCompany() {
  const userId = randomUUID();
  await prisma.identityUser.create({
    data: { id: userId, name: "Ramesh Patil", email: `${userId}@example.test` },
  });
  const { workspaceId } = await createCompanyHandlers().create.execute({
    name: "Patil Builders",
    country: "IN",
    userId,
    userName: "Ramesh Patil",
    userMobile: "+919800000001",
    userEmail: null,
  });
  const designations = await createDesignationHandlers().list(workspaceId);
  const byName = (name: string) =>
    designations.find((item) => item.name === name)?.id ?? "";
  return { workspaceId, userId, byName };
}

describe("Team Members on Postgres (CM-108)", () => {
  const handlers = createTeamMemberHandlers();

  it("creates the Owner's own record with the Company", async () => {
    const { workspaceId, userId } = await newCompany();
    const page = await handlers.list({ workspaceId, limit: 10 });
    expect(page.items).toEqual([
      expect.objectContaining({
        userId,
        isOwner: true,
        status: "active",
        mobile: "+919800000001",
        designation: expect.objectContaining({ name: "Owner" }) as unknown,
      }),
    ]);
  });

  it("invites with the Designation's template and stores Aadhaar and PAN encrypted", async () => {
    const { workspaceId, userId, byName } = await newCompany();
    const invited = await handlers.invite({
      workspaceId,
      by: userId,
      memberType: "normal",
      details: {
        name: "Suresh Kale",
        designationId: byName("Site Engineer"),
        mobile: "+919800000002",
        aadhaar: "234123412346",
        pan: "ABCPE1234F",
      },
      projectIds: ["project-a"],
    });
    expect(invited).toMatchObject({
      status: "joining_pending",
      aadhaarMasked: "XXXXXXXX2346",
      panMasked: "XXXXXX234F",
      projectIds: ["project-a"],
    });
    expect(invited.invitePath).toMatch(/^\/join\//);
    expect(invited.permissions["labour.attendance"]).toEqual([
      "create",
      "read",
      "update",
    ]);

    const row =
      await prisma.constructionOrganizationTeamMember.findUniqueOrThrow({
        where: { id: invited.id },
      });
    expect(row.aadhaarEncrypted).not.toContain("234123412346");
    expect(row.aadhaarLast4).toBe("2346");
    await expect(
      handlers.revealIdentifiers({ workspaceId, id: invited.id, by: userId }),
    ).resolves.toEqual({ aadhaar: "234123412346", pan: "ABCPE1234F" });
    await expect(
      prisma.constructionOrganizationAuditEvent.count({
        where: {
          entityId: invited.id,
          action: "team_member.identifiers_revealed",
        },
      }),
    ).resolves.toBe(1);
  });

  it("gives an HRMS member the HRMS default set and no projects", async () => {
    const { workspaceId, userId, byName } = await newCompany();
    const hrms = await handlers.invite({
      workspaceId,
      by: userId,
      memberType: "hrms",
      details: {
        name: "Anita",
        designationId: byName("Accountant"),
        email: "anita@p.in",
      },
      projectIds: ["project-a"],
      permissions: { "finance.petty_cash": ["approve"] },
    });
    expect(hrms.projectIds).toEqual([]);
    expect(Object.keys(hrms.permissions).sort()).toEqual([
      "hrms.attendance",
      "hrms.holidays",
      "hrms.hrms",
      "hrms.leaves",
      "hrms.salaries",
    ]);
  });

  it("keeps mobiles and emails unique among live members", async () => {
    const { workspaceId, userId, byName } = await newCompany();
    const base = {
      workspaceId,
      by: userId,
      memberType: "normal" as const,
    };
    const first = await handlers.invite({
      ...base,
      details: {
        name: "A",
        designationId: byName("Admin"),
        mobile: "+919800000003",
      },
    });
    await expect(
      handlers.invite({
        ...base,
        details: {
          name: "B",
          designationId: byName("Admin"),
          mobile: "+919800000003",
        },
      }),
    ).rejects.toMatchObject({ code: "MEMBER_MOBILE_IN_USE" });
    await handlers.remove({ workspaceId, id: first.id, by: userId });
    await expect(
      handlers.invite({
        ...base,
        details: {
          name: "B",
          designationId: byName("Admin"),
          mobile: "+919800000003",
        },
      }),
    ).resolves.toMatchObject({ name: "B" });
  });

  it("lists with search, status and cursor pages", async () => {
    const { workspaceId, userId, byName } = await newCompany();
    for (const [index, name] of ["Asha", "Bhavesh", "Chetan"].entries())
      await handlers.invite({
        workspaceId,
        by: userId,
        memberType: "normal",
        details: {
          name,
          designationId: byName("Site Supervisor"),
          mobile: `+91980000010${String(index)}`,
        },
      });
    const pending = await handlers.list({
      workspaceId,
      limit: 2,
      status: "joining_pending",
    });
    expect(pending.total).toBe(3);
    expect(pending.hasMore).toBe(true);
    expect(pending.items.map((item) => item.name)).toEqual([
      "Chetan",
      "Bhavesh",
    ]);
    const last = pending.items.at(-1);
    const next = await handlers.list({
      workspaceId,
      limit: 2,
      status: "joining_pending",
      after: { createdAt: last?.createdAt ?? new Date(), id: last?.id ?? "" },
    });
    expect(next.items.map((item) => item.name)).toEqual(["Asha"]);
    const found = await handlers.list({
      workspaceId,
      limit: 10,
      search: "bhav",
    });
    expect(found.items.map((item) => item.name)).toEqual(["Bhavesh"]);
  });

  it("loads an active member's matrix and projects for can()", async () => {
    const { workspaceId, userId, byName } = await newCompany();
    const invited = await handlers.invite({
      workspaceId,
      by: userId,
      memberType: "normal",
      details: {
        name: "Suresh",
        designationId: byName("Site Engineer"),
        mobile: "+919800000004",
      },
      projectIds: ["project-a"],
    });
    const memberUser = randomUUID();
    await prisma.constructionOrganizationTeamMember.update({
      where: { id: invited.id },
      data: { status: "active", userId: memberUser },
    });
    const access = await loadMemberAccess(prisma, {
      workspaceId,
      userId: memberUser,
      role: "member",
    });
    expect(
      can(access, "site_work.daily_worksheet", "create", {
        projectId: "project-a",
      }),
    ).toBe(true);
    expect(
      can(access, "site_work.daily_worksheet", "create", {
        projectId: "project-b",
      }),
    ).toBe(false);
    expect(can(access, "organization.team_members", "create")).toBe(false);
  });
});
