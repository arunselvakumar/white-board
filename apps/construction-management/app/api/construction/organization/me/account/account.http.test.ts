import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { financeAuthorNames } from "@/src/composition/finance-author-names";
import {
  addNotificationAndPreference,
  addPushSubscription,
  codeFor,
  messagingCounts,
  sessionIdOf,
  signInAgain,
} from "@/test/accounts";
import { jsonRequest, memberWith, ownerWithCompany } from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import { POST as deleteAccount } from "./delete/route";
import { GET as accountStatus } from "./route";

const BASE = `${TEST_ORIGIN}/api/construction/organization/me/account`;

function remove(
  cookie: string,
  body: { reason?: string; confirmation: string; code: string },
) {
  return deleteAccount(jsonRequest(`${BASE}/delete`, cookie, body));
}

/** A member of two Companies, with push, notifications and two sessions. */
async function memberOfTwoCompanies() {
  const first = await ownerWithCompany("Anugraha Engineers");
  const second = await ownerWithCompany("Velan Builders");
  const member = await memberWith(first, {});
  // The same User joins the second Company too.
  const inSecond =
    await prisma.constructionOrganizationTeamMember.findFirstOrThrow({
      where: { workspaceId: first.workspaceId, userId: member.userId },
    });
  const secondMemberId = crypto.randomUUID();
  await prisma.constructionOrganizationTeamMember.create({
    data: {
      id: secondMemberId,
      workspaceId: second.workspaceId,
      userId: member.userId,
      name: "Member in Velan",
      designationId: second.designationId("Site Engineer"),
      email: member.email,
      memberType: "normal",
      status: "active",
      createdBy: second.userId,
      updatedBy: second.userId,
      joinedAt: new Date(),
    },
  });
  await prisma.identityWorkspaceMember.create({
    data: {
      id: `member_${secondMemberId}`,
      organizationId: second.workspaceId,
      userId: member.userId,
      role: "member",
      createdAt: new Date(),
    },
  });
  const sessionId = await sessionIdOf(member.cookie);
  const otherDevice = await signInAgain(member.email);
  await addPushSubscription(member.userId, sessionId);
  await addPushSubscription(member.userId, otherDevice.sessionId);
  await addNotificationAndPreference(first.workspaceId, member.userId);
  return { first, second, member, firstMemberId: inSecond.id, secondMemberId };
}

describe("Delete My Account (CM-907)", () => {
  it("is refused for an Owner, naming the Companies to hand over", async () => {
    const owner = await ownerWithCompany("Anugraha Engineers");
    const status = await accountStatus(jsonRequest(BASE, owner.cookie));
    expect(await status.json()).toEqual({
      ownedCompanies: [{ id: owner.workspaceId, name: "Anugraha Engineers" }],
    });
    const code = await codeFor(owner, "delete_account");
    const response = await remove(owner.cookie, {
      confirmation: "DELETE",
      code,
    });
    expect(response.status).toBe(StatusCodes.CONFLICT);
    expect(await response.json()).toMatchObject({
      code: "OWNER_MUST_HAND_OVER",
      details: {
        companies: [{ id: owner.workspaceId, name: "Anugraha Engineers" }],
      },
    });
    await expect(
      prisma.identityUser.findUniqueOrThrow({ where: { id: owner.userId } }),
    ).resolves.toMatchObject({ email: owner.email });
  });

  it("needs DELETE typed and the right code", async () => {
    const { member } = await memberOfTwoCompanies();
    const code = await codeFor(member, "delete_account");
    const typo = await remove(member.cookie, { confirmation: "delete", code });
    expect(typo.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await typo.json()).toMatchObject({ code: "CONFIRMATION_MISMATCH" });
    const wrong = await remove(member.cookie, {
      confirmation: "DELETE",
      code: code === "111111" ? "222222" : "111111",
    });
    expect(wrong.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await wrong.json()).toMatchObject({ code: "ACTION_CODE_INVALID" });
    await expect(
      prisma.identityWorkspaceMember.count({
        where: { userId: member.userId },
      }),
    ).resolves.toBe(2);
  });

  it("leaves every Company, keeps the Team Members as Left, erases the identity and signs out", async () => {
    const world = await memberOfTwoCompanies();
    const { member } = world;
    const code = await codeFor(member, "delete_account");
    // Codes of other people whose address merely ends like this one's stay.
    const memberEmail = (
      await prisma.identityUser.findUniqueOrThrow({
        where: { id: member.userId },
      })
    ).email;
    const lookalike = `email-otp-x${memberEmail}`;
    await prisma.identityVerification.create({
      data: {
        id: crypto.randomUUID(),
        identifier: lookalike,
        value: "123456:0",
        expiresAt: new Date(Date.now() + 600_000),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    const response = await remove(member.cookie, {
      reason: "Changed jobs",
      confirmation: "DELETE",
      code,
    });
    expect(response.status).toBe(StatusCodes.NO_CONTENT);

    // Memberships gone; Team Member records kept, Left and unlinked.
    await expect(
      prisma.identityWorkspaceMember.count({
        where: { userId: member.userId },
      }),
    ).resolves.toBe(0);
    for (const id of [world.firstMemberId, world.secondMemberId]) {
      const row =
        await prisma.constructionOrganizationTeamMember.findUniqueOrThrow({
          where: { id },
        });
      expect(row).toMatchObject({
        status: "left",
        userId: null,
        deletedAt: null,
      });
    }
    // Audited in each Company.
    for (const workspaceId of [
      world.first.workspaceId,
      world.second.workspaceId,
    ])
      await expect(
        prisma.constructionOrganizationAuditEvent.count({
          where: { workspaceId, action: "team_member.account_deleted" },
        }),
      ).resolves.toBe(1);

    // Sessions, push, notifications and preferences deleted.
    await expect(
      prisma.identitySession.count({ where: { userId: member.userId } }),
    ).resolves.toBe(0);
    await expect(messagingCounts(member.userId)).resolves.toEqual({
      push: 0,
      notifications: 0,
      preferences: 0,
    });
    await expect(
      prisma.identityAccount.count({ where: { userId: member.userId } }),
    ).resolves.toBe(0);
    await expect(
      prisma.identityVerification.count({
        where: { identifier: lookalike },
      }),
    ).resolves.toBe(1);

    // The identity is erased; the row stays.
    const user = await prisma.identityUser.findUniqueOrThrow({
      where: { id: member.userId },
    });
    expect(user).toMatchObject({
      name: "Deleted user",
      email: `deleted+${member.userId}@invalid`,
      phoneNumber: null,
      image: null,
      emailVerified: false,
    });
    await expect(
      prisma.constructionOrganizationAccountDeletion.findFirstOrThrow({
        where: { userId: member.userId },
      }),
    ).resolves.toMatchObject({ reason: "Changed jobs" });

    // "Who" now reads Deleted user; the request's own session is gone.
    const names = await financeAuthorNames().namesOf(world.first.workspaceId, [
      member.userId,
      world.first.userId,
    ]);
    expect(names.get(member.userId)).toBe("Deleted user");
    expect(names.get(world.first.userId)).toBe("Arun Selva Kumar");
    expect((await accountStatus(jsonRequest(BASE, member.cookie))).status).toBe(
      StatusCodes.UNAUTHORIZED,
    );
  });

  it("answers 401 without a session", async () => {
    expect(
      (await remove("", { confirmation: "DELETE", code: "123456" })).status,
    ).toBe(StatusCodes.UNAUTHORIZED);
  });
});
