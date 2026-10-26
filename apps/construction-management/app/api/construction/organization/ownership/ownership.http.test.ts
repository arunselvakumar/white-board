import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { createRoleHandlers } from "@/src/organization/infrastructure/create-role-handlers";
import { MENUS } from "@/src/shared-kernel/access";
import { codeFor } from "@/test/accounts";
import { jsonRequest, memberWith, ownerWithCompany } from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import { GET as candidates } from "./candidates/route";
import { POST as transfer } from "./transfer/route";

const BASE = `${TEST_ORIGIN}/api/construction/organization/ownership`;

function transferTo(cookie: string, memberId: string, code: string) {
  return transfer(jsonRequest(`${BASE}/transfer`, cookie, { memberId, code }));
}

async function role(workspaceId: string, userId: string) {
  const row = await prisma.identityWorkspaceMember.findUniqueOrThrow({
    where: { organizationId_userId: { organizationId: workspaceId, userId } },
  });
  return row.role;
}

function memberRow(workspaceId: string, userId: string) {
  return prisma.constructionOrganizationTeamMember.findFirstOrThrow({
    where: { workspaceId, userId, deletedAt: null },
    include: { role: true },
  });
}

describe("Transfer ownership (CM-907)", () => {
  it("is the Owner's alone", async () => {
    const owner = await ownerWithCompany();
    const member = await memberWith(owner, {
      "organization.team_members": ["read", "create", "update", "delete"],
    });
    expect(
      (await candidates(jsonRequest(`${BASE}/candidates`, member.cookie)))
        .status,
    ).toBe(StatusCodes.FORBIDDEN);
    const refused = await transferTo(member.cookie, member.memberId, "123456");
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
  });

  it("lists active, joined Normal Team Members other than the Owner", async () => {
    const owner = await ownerWithCompany();
    const member = await memberWith(owner, {});
    const response = await candidates(
      jsonRequest(`${BASE}/candidates`, owner.cookie),
    );
    expect(response.status).toBe(StatusCodes.OK);
    const body = (await response.json()) as {
      items: { id: string; name: string; role: string | null }[];
    };
    expect(body.items).toEqual([
      {
        id: member.memberId,
        name: "Member",
        role: expect.stringMatching(/^Access /) as unknown,
      },
    ]);
  });

  it("needs the right code", async () => {
    const owner = await ownerWithCompany();
    const member = await memberWith(owner, {});
    const code = await codeFor(owner, "transfer_ownership");
    const wrong = await transferTo(
      owner.cookie,
      member.memberId,
      code === "111111" ? "222222" : "111111",
    );
    expect(wrong.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await wrong.json()).toMatchObject({ code: "ACTION_CODE_INVALID" });
    await expect(role(owner.workspaceId, owner.userId)).resolves.toBe("owner");
    // A code for another purpose does not do.
    const other = await codeFor(owner, "delete_company");
    const mismatched = await transferTo(owner.cookie, member.memberId, other);
    expect(mismatched.status).toBe(StatusCodes.BAD_REQUEST);
  });

  it("makes the member the Owner and the old Owner an Admin member, audited", async () => {
    const owner = await ownerWithCompany();
    const member = await memberWith(owner, {});
    const code = await codeFor(owner, "transfer_ownership");
    const response = await transferTo(owner.cookie, member.memberId, code);
    expect(response.status).toBe(StatusCodes.OK);
    expect(await response.json()).toEqual({ ownerId: member.memberId });

    await expect(role(owner.workspaceId, member.userId)).resolves.toBe("owner");
    await expect(role(owner.workspaceId, owner.userId)).resolves.toBe("member");
    const newOwner = await memberRow(owner.workspaceId, member.userId);
    expect(newOwner).toMatchObject({ isOwner: true });
    expect(newOwner.roleId).toBeNull();
    const oldOwner = await memberRow(owner.workspaceId, owner.userId);
    expect(oldOwner.isOwner).toBe(false);
    expect(oldOwner.role).toMatchObject({ name: "Admin", isSeed: true });

    const audit =
      await prisma.constructionOrganizationAuditEvent.findFirstOrThrow({
        where: {
          workspaceId: owner.workspaceId,
          action: "company.ownership_transferred",
        },
      });
    expect(audit).toMatchObject({
      actorUserId: owner.userId,
      entityId: member.memberId,
    });

    // One Owner at a time: the old Owner can no longer act as one, the new one can.
    expect(
      (await candidates(jsonRequest(`${BASE}/candidates`, owner.cookie)))
        .status,
    ).toBe(StatusCodes.FORBIDDEN);
    expect(
      (await candidates(jsonRequest(`${BASE}/candidates`, member.cookie)))
        .status,
    ).toBe(StatusCodes.OK);
  });

  it("makes a Role with every right for the old Owner when the Company deleted Admin", async () => {
    const owner = await ownerWithCompany();
    const member = await memberWith(owner, {});
    const roles = createRoleHandlers();
    const admin = (await roles.list(owner.workspaceId)).find(
      (item) => item.name === "Admin",
    );
    await roles.delete({
      workspaceId: owner.workspaceId,
      id: admin?.id ?? "",
      by: owner.userId,
    });
    const code = await codeFor(owner, "transfer_ownership");
    const response = await transferTo(owner.cookie, member.memberId, code);
    expect(response.status).toBe(StatusCodes.OK);
    const oldOwner = await memberRow(owner.workspaceId, owner.userId);
    const made = (await roles.list(owner.workspaceId)).find(
      (item) => item.id === oldOwner.roleId,
    );
    expect(made?.name).toMatch(/'s access$/);
    expect(made?.userCount).toBe(1);
    expect(Object.keys(made?.permissions ?? {})).toHaveLength(MENUS.length);
  });

  it("refuses a Team Member who has not joined", async () => {
    const owner = await ownerWithCompany();
    const member = await memberWith(owner, {});
    await prisma.constructionOrganizationTeamMember.update({
      where: { id: member.memberId },
      data: { memberType: "hrms" },
    });
    const code = await codeFor(owner, "transfer_ownership");
    const hrms = await transferTo(owner.cookie, member.memberId, code);
    expect(hrms.status).toBe(StatusCodes.CONFLICT);
    expect(await hrms.json()).toMatchObject({ code: "OWNER_IS_NORMAL" });

    const unknown = await transferTo(
      owner.cookie,
      "0199c3a0-0000-7000-8000-00000000dead",
      code,
    );
    expect(unknown.status).toBe(StatusCodes.NOT_FOUND);
    await expect(role(owner.workspaceId, owner.userId)).resolves.toBe("owner");
  });
});
