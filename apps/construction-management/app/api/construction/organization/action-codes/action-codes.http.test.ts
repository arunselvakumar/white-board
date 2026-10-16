import { outbox, smsOutbox } from "@repo/auth/construction/testing";
import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { afterEach, describe, expect, it } from "vitest";

import { POST as revealMine } from "@/app/api/construction/organization/me/profile/reveal-identifiers/route";
import { POST as revealMember } from "@/app/api/construction/organization/team-members/[id]/reveal/route";
import {
  ageCodes,
  codeFor,
  lastCodeEmailedTo,
  requestCode,
  sessionIdOf,
} from "@/test/accounts";
import { jsonRequest, memberWith, ownerWithCompany } from "@/test/companies";
import { newMobile, TEST_ORIGIN, TEST_OTP, withSms } from "@/test/sessions";

import { POST as verify } from "./verify/route";

const BASE = `${TEST_ORIGIN}/api/construction/organization`;

function verifyReveal(cookie: string, code: string) {
  return verify(
    jsonRequest(`${BASE}/action-codes/verify`, cookie, {
      purpose: "reveal_identifiers",
      code,
    }),
  );
}

function revealOwn(cookie: string) {
  return revealMine(
    jsonRequest(`${BASE}/me/profile/reveal-identifiers`, cookie, {}),
  );
}

async function errorCode(response: Response): Promise<string> {
  return ((await response.json()) as { code: string }).code;
}

function wrongFor(code: string): string {
  return code === "111111" ? "222222" : "111111";
}

describe("POST /api/construction/organization/action-codes", () => {
  afterEach(() => {
    outbox.length = 0;
  });

  it("emails a six-digit code, stores only its hash, and allows one per minute", async () => {
    const owner = await ownerWithCompany();
    const response = await requestCode(owner.cookie, "delete_company");
    expect(response.status).toBe(StatusCodes.NO_CONTENT);
    const mail = outbox.filter((item) => item.to === owner.email).at(-1);
    expect(mail?.subject).toMatch(
      /^\d{6} is your Construction Management confirmation code$/,
    );
    expect(mail?.text).toContain("delete your Company");
    const code = lastCodeEmailedTo(owner.email);
    const row =
      await prisma.constructionOrganizationActionCode.findFirstOrThrow({
        where: { userId: owner.userId, purpose: "delete_company" },
      });
    expect(row.codeHash).not.toContain(code);
    expect(row.workspaceId).toBe(owner.workspaceId);
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBe(600_000);

    const again = await requestCode(owner.cookie, "delete_company");
    expect(again.status).toBe(StatusCodes.TOO_MANY_REQUESTS);
    expect(await errorCode(again)).toBe("ACTION_CODE_TOO_SOON");
    // Another purpose has its own minute.
    expect((await requestCode(owner.cookie, "transfer_ownership")).status).toBe(
      StatusCodes.NO_CONTENT,
    );
  });

  it("keeps Company purposes to the Owner; any member may ask for a reveal code", async () => {
    const owner = await ownerWithCompany();
    const member = await memberWith(owner, {});
    for (const purpose of [
      "transfer_ownership",
      "delete_company",
      "company_backup",
    ]) {
      const refused = await requestCode(member.cookie, purpose);
      expect(refused.status).toBe(StatusCodes.FORBIDDEN);
    }
    expect(
      (await requestCode(member.cookie, "reveal_identifiers")).status,
    ).toBe(StatusCodes.NO_CONTENT);
    expect((await requestCode(member.cookie, "delete_account")).status).toBe(
      StatusCodes.NO_CONTENT,
    );
    const anonymous = await requestCode("", "delete_account");
    expect(anonymous.status).toBe(StatusCodes.UNAUTHORIZED);
    const unknown = await requestCode(member.cookie, "everything");
    expect(unknown.status).toBe(StatusCodes.BAD_REQUEST);
  });

  it("texts the code while SMS is on and the User signs in by mobile", async () => {
    const sms = withSms();
    sms.on();
    try {
      const owner = await ownerWithCompany();
      const mobile = newMobile();
      await prisma.identityUser.update({
        where: { id: owner.userId },
        data: { phoneNumber: mobile, phoneNumberVerified: true },
      });
      smsOutbox.length = 0;
      expect((await requestCode(owner.cookie, "delete_company")).status).toBe(
        StatusCodes.NO_CONTENT,
      );
      const text = smsOutbox.find((item) => item.to === mobile);
      expect(text?.code).toMatch(/^\d{6}$/);
      expect(text?.text).toContain("delete your Company");
    } finally {
      sms.off();
    }
  });
});

describe("Aadhaar and PAN reveal needs a code (ADR CM-0021 §11)", () => {
  it("refuses a reveal until a code is verified, then allows it for 10 minutes in that session only", async () => {
    const owner = await ownerWithCompany();
    const refused = await revealOwn(owner.cookie);
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect(await errorCode(refused)).toBe("REVEAL_CODE_REQUIRED");

    const code = await codeFor(owner, "reveal_identifiers");
    expect((await verifyReveal(owner.cookie, code)).status).toBe(
      StatusCodes.NO_CONTENT,
    );
    const revealed = await revealOwn(owner.cookie);
    expect(revealed.status).toBe(StatusCodes.OK);
    // Each reveal is still audited.
    await expect(
      prisma.constructionOrganizationAuditEvent.count({
        where: {
          workspaceId: owner.workspaceId,
          action: "team_member.identifiers_revealed",
        },
      }),
    ).resolves.toBe(1);

    // The window belongs to this session and ends after 10 minutes.
    const sessionId = await sessionIdOf(owner.cookie);
    await prisma.constructionOrganizationActionCode.updateMany({
      where: { sessionId, purpose: "reveal_identifiers" },
      data: { verifiedUntil: new Date(Date.now() - 1000) },
    });
    expect((await revealOwn(owner.cookie)).status).toBe(StatusCodes.CONFLICT);
  });

  it("gates the Owner's reveal of a Team Member's identifiers the same way", async () => {
    const owner = await ownerWithCompany();
    const member = await memberWith(owner, {});
    const call = () =>
      revealMember(
        jsonRequest(
          `${BASE}/team-members/${member.memberId}/reveal`,
          owner.cookie,
          {},
        ),
        { params: Promise.resolve({ id: member.memberId }) },
      );
    expect(await errorCode(await call())).toBe("REVEAL_CODE_REQUIRED");
    const code = await codeFor(owner, "reveal_identifiers");
    expect((await verifyReveal(owner.cookie, code)).status).toBe(
      StatusCodes.NO_CONTENT,
    );
    expect((await call()).status).toBe(StatusCodes.OK);
  });

  it("refuses wrong, used, expired and locked codes", async () => {
    const owner = await ownerWithCompany();
    const code = await codeFor(owner, "reveal_identifiers");

    const wrong = await verifyReveal(owner.cookie, wrongFor(code));
    expect(wrong.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await wrong.json()).toMatchObject({
      code: "ACTION_CODE_INVALID",
      details: { attemptsLeft: 4 },
    });
    expect((await verifyReveal(owner.cookie, code)).status).toBe(
      StatusCodes.NO_CONTENT,
    );
    // Used once: the same code is gone.
    const used = await verifyReveal(owner.cookie, code);
    expect(await errorCode(used)).toBe("ACTION_CODE_NOT_FOUND");

    const second = await codeFor(owner, "reveal_identifiers");
    await prisma.constructionOrganizationActionCode.updateMany({
      where: { userId: owner.userId, consumedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await errorCode(await verifyReveal(owner.cookie, second))).toBe(
      "ACTION_CODE_EXPIRED",
    );

    const third = await codeFor(owner, "reveal_identifiers");
    for (let attempt = 0; attempt < 5; attempt += 1)
      expect((await verifyReveal(owner.cookie, wrongFor(third))).status).toBe(
        StatusCodes.BAD_REQUEST,
      );
    const locked = await verifyReveal(owner.cookie, third);
    expect(locked.status).toBe(StatusCodes.TOO_MANY_REQUESTS);
    expect(await errorCode(locked)).toBe("ACTION_CODE_LOCKED");
  });

  it("a new code replaces the last, and the test code stands in for a live one", async () => {
    const owner = await ownerWithCompany();
    const first = await codeFor(owner, "reveal_identifiers");
    await ageCodes(owner.userId);
    const second = await codeFor(owner, "reveal_identifiers");
    if (first !== second)
      expect(await errorCode(await verifyReveal(owner.cookie, first))).toBe(
        "ACTION_CODE_INVALID",
      );
    expect((await verifyReveal(owner.cookie, TEST_OTP)).status).toBe(
      StatusCodes.NO_CONTENT,
    );
    // Without a live code the test code is refused too.
    expect(await errorCode(await verifyReveal(owner.cookie, TEST_OTP))).toBe(
      "ACTION_CODE_NOT_FOUND",
    );
  });

  it("answers 400 for a code that is not six digits", async () => {
    const owner = await ownerWithCompany();
    const response = await verifyReveal(owner.cookie, "12ab");
    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await errorCode(response)).toBe("VALIDATION_ERROR");
  });
});
