import { outbox, seedCompanyMember } from "@repo/auth/construction/testing";
import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as authGet } from "@/app/api/auth/[...all]/route";
import { GET as myCompanies } from "@/app/api/construction/organization/companies/me/route";
import { GET as joinRequests } from "@/app/api/construction/organization/join-requests/route";
import { jsonRequest, memberWith, ownerWithCompany } from "@/test/companies";
import {
  TEST_ORIGIN,
  TEST_PASSWORD,
  lastEmailCodeFor,
  newEmail,
  newMobile,
  postAuth,
  sessionCookie,
  signInByEmail,
} from "@/test/sessions";

import { POST as setPassword } from "./[id]/password/route";
import { GET as getOne } from "./[id]/route";
import { GET as list, POST as create } from "./route";

const BASE = `${TEST_ORIGIN}/api/construction/organization/team-members`;
const FIRST_PASSWORD = "first-pass-1234";

type Member = {
  id: string;
  userId: string | null;
  status: string;
  role: { id: string; name: string } | null;
  canSetPassword: boolean;
  passwordIgnored: string | null;
};

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

/** The invitation emailed to `email` (not a sign-in code). */
function invitationsTo(email: string) {
  return outbox.filter(
    (mail) => mail.to === email && mail.text.includes("/join/"),
  );
}

function addUser(
  owner: Awaited<ReturnType<typeof ownerWithCompany>>,
  fields: Record<string, unknown>,
) {
  return create(
    jsonRequest(BASE, owner.cookie, {
      name: "Murugan Pillai",
      designationId: owner.designationId("Site Supervisor"),
      memberType: "normal",
      roleId: owner.roleId("Site Supervisor"),
      ...fields,
    }),
  );
}

function companiesAs(cookie: string) {
  return myCompanies(
    jsonRequest(
      `${TEST_ORIGIN}/api/construction/organization/companies/me`,
      cookie,
    ),
  );
}

describe("Add User: invite, set a password, or a record (ADR CM-0030 §6)", () => {
  it("makes the account at once, and asks for a new password at first sign-in", async () => {
    const owner = await ownerWithCompany();
    const mobile = newMobile();
    const created = await addUser(owner, {
      mobile,
      password: FIRST_PASSWORD,
      invite: true,
    });
    expect(created.status).toBe(StatusCodes.CREATED);
    const member = await json<Member>(created);
    expect(member).toMatchObject({
      status: "active",
      passwordIgnored: null,
      role: { name: "Site Supervisor" },
      canSetPassword: true,
    });
    const user = await prisma.identityUser.findUniqueOrThrow({
      where: { id: member.userId ?? "" },
    });
    expect(user).toMatchObject({
      phoneNumber: mobile,
      phoneNumberVerified: true,
      emailVerified: false,
      mustChangePassword: true,
      email: `${mobile.slice(1)}@mobile.invalid`,
    });

    const wrong = await postAuth("/sign-in/phone-number", {
      phoneNumber: mobile,
      password: "not-the-password",
    });
    expect(wrong.status).toBe(StatusCodes.UNAUTHORIZED);
    expect(await json(wrong)).toMatchObject({
      code: "INVALID_PHONE_NUMBER_OR_PASSWORD",
    });
    const signedIn = await postAuth("/sign-in/phone-number", {
      phoneNumber: mobile,
      password: FIRST_PASSWORD,
    });
    expect(signedIn.status).toBe(StatusCodes.OK);
    const cookie = sessionCookie(signedIn);
    // The flag is on the session's User, for the pages' redirect.
    const session = await json<{ user: { mustChangePassword: boolean } }>(
      await authGet(
        new Request(`${TEST_ORIGIN}/api/auth/get-session`, {
          headers: { cookie },
        }),
      ),
    );
    expect(session.user.mustChangePassword).toBe(true);

    const blocked = await companiesAs(cookie);
    expect(blocked.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json(blocked)).toMatchObject({
      code: "PASSWORD_CHANGE_REQUIRED",
    });

    const same = await postAuth(
      "/change-password",
      {
        currentPassword: FIRST_PASSWORD,
        newPassword: FIRST_PASSWORD,
        revokeOtherSessions: true,
      },
      cookie,
    );
    expect(same.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(same)).toMatchObject({ code: "PASSWORD_UNCHANGED" });

    const changed = await postAuth(
      "/change-password",
      {
        currentPassword: FIRST_PASSWORD,
        newPassword: "my-own-pass-5678",
        revokeOtherSessions: true,
      },
      cookie,
    );
    expect(changed.status).toBe(StatusCodes.OK);
    await expect(
      prisma.identityUser.findUniqueOrThrow({ where: { id: user.id } }),
    ).resolves.toMatchObject({ mustChangePassword: false });
    const open = await companiesAs(sessionCookie(changed));
    expect(open.status).toBe(StatusCodes.OK);
    expect(
      (await json<{ items: { id: string }[] }>(open)).items.map(
        (item) => item.id,
      ),
    ).toEqual([owner.workspaceId]);
  });

  it("clears the flag when they reset the password by email code", async () => {
    const owner = await ownerWithCompany();
    const email = newEmail();
    const member = await json<Member>(
      await addUser(owner, { email, password: FIRST_PASSWORD }),
    );
    expect(member.status).toBe("active");
    expect(invitationsTo(email)).toEqual([]);
    const requested = await postAuth("/email-otp/request-password-reset", {
      email,
    });
    expect(requested.ok).toBe(true);
    const reset = await postAuth("/email-otp/reset-password", {
      email,
      otp: lastEmailCodeFor(email),
      password: "chosen-pass-5678",
    });
    expect(reset.status).toBe(StatusCodes.OK);
    await expect(
      prisma.identityUser.findUniqueOrThrow({
        where: { id: member.userId ?? "" },
      }),
    ).resolves.toMatchObject({ mustChangePassword: false });
  });

  it("never touches an existing account: a Join Request instead", async () => {
    const owner = await ownerWithCompany();
    const existing = await signInByEmail();
    const response = await addUser(owner, {
      email: existing.email,
      password: FIRST_PASSWORD,
    });
    expect(response.status).toBe(StatusCodes.CREATED);
    expect(await json(response)).toMatchObject({
      status: "joining_pending",
      userId: null,
      passwordIgnored: "existing_account",
    });
    expect(invitationsTo(existing.email)).toHaveLength(1);
    // Their own password still works; the admin's does not.
    const own = await postAuth("/sign-in/email", {
      email: existing.email,
      password: TEST_PASSWORD,
    });
    expect(own.status).toBe(StatusCodes.OK);
    const admins = await postAuth("/sign-in/email", {
      email: existing.email,
      password: FIRST_PASSWORD,
    });
    expect(admins.status).toBe(StatusCodes.UNAUTHORIZED);
    await expect(
      prisma.identityUser.findUniqueOrThrow({
        where: { id: existing.userId },
      }),
    ).resolves.toMatchObject({ mustChangePassword: false });
  });

  it("sends a mobile-only existing User a Join Request they can see", async () => {
    // Company A sets their first password, so their mobile is verified.
    const first = await ownerWithCompany();
    const mobile = newMobile();
    await addUser(first, { mobile, password: FIRST_PASSWORD });
    const signedIn = await postAuth("/sign-in/phone-number", {
      phoneNumber: mobile,
      password: FIRST_PASSWORD,
    });
    const cookie = sessionCookie(signedIn);
    const changed = await postAuth(
      "/change-password",
      {
        currentPassword: FIRST_PASSWORD,
        newPassword: TEST_PASSWORD,
        revokeOtherSessions: false,
      },
      cookie,
    );
    expect(changed.status).toBe(StatusCodes.OK);

    // Company B tries to set a password too: a Join Request instead.
    const second = await ownerWithCompany("Kaveri Builders");
    const added = await json<Member>(
      await addUser(second, { mobile, password: FIRST_PASSWORD }),
    );
    expect(added.passwordIgnored).toBe("existing_account");

    // With no email, the verified mobile is what matches, SMS on or off.
    const requests = await json<{ items: { companyName: string }[] }>(
      await joinRequests(
        jsonRequest(
          `${TEST_ORIGIN}/api/construction/organization/join-requests`,
          cookie,
        ),
      ),
    );
    expect(requests.items.map((item) => item.companyName)).toEqual([
      "Kaveri Builders",
    ]);
  });

  it("invites by email, or keeps a record to invite later", async () => {
    const owner = await ownerWithCompany();
    const invitedEmail = newEmail();
    const invited = await json<Member>(
      await addUser(owner, { email: invitedEmail, invite: true }),
    );
    expect(invited.status).toBe("joining_pending");
    expect(invitationsTo(invitedEmail)).toHaveLength(1);

    const recordEmail = newEmail();
    const record = await json<Member>(
      await addUser(owner, { email: recordEmail, invite: false }),
    );
    expect(record).toMatchObject({ status: "joining_pending", userId: null });
    expect(invitationsTo(recordEmail)).toEqual([]);
  });
});

describe("Set a new password (ADR CM-0030 §7)", () => {
  function setPasswordOf(cookie: string, id: string, password: string) {
    return setPassword(
      jsonRequest(`${BASE}/${id}/password`, cookie, { password }),
      params(id),
    );
  }

  it("makes the account for a record without a User", async () => {
    const owner = await ownerWithCompany();
    const mobile = newMobile();
    const record = await json<Member>(
      await addUser(owner, { mobile, invite: false }),
    );
    const response = await setPasswordOf(
      owner.cookie,
      record.id,
      FIRST_PASSWORD,
    );
    expect(response.status).toBe(StatusCodes.OK);
    expect(await json(response)).toMatchObject({
      status: "active",
      passwordIgnored: null,
    });
    const signedIn = await postAuth("/sign-in/phone-number", {
      phoneNumber: mobile,
      password: FIRST_PASSWORD,
    });
    expect(signedIn.status).toBe(StatusCodes.OK);
  });

  it("resets a User only this Company relies on, and ends their sessions", async () => {
    const owner = await ownerWithCompany();
    const member = await memberWith(owner, {});
    const shown = await json<Member>(
      await getOne(
        jsonRequest(`${BASE}/${member.memberId}`, owner.cookie),
        params(member.memberId),
      ),
    );
    expect(shown.canSetPassword).toBe(true);
    const response = await setPasswordOf(
      owner.cookie,
      member.memberId,
      FIRST_PASSWORD,
    );
    expect(response.status).toBe(StatusCodes.OK);
    await expect(
      prisma.identityUser.findUniqueOrThrow({ where: { id: member.userId } }),
    ).resolves.toMatchObject({ mustChangePassword: true });
    const old = await list(jsonRequest(BASE, member.cookie));
    expect(old.status).toBe(StatusCodes.UNAUTHORIZED);
    const signedIn = await postAuth("/sign-in/email", {
      email: member.email,
      password: FIRST_PASSWORD,
    });
    expect(signedIn.status).toBe(StatusCodes.OK);
  });

  it("lets a Member set a password only for someone whose access they hold", async () => {
    const owner = await ownerWithCompany();
    const manager = await memberWith(owner, {
      "organization.team_members": ["read", "update"],
    });
    const stronger = await memberWith(owner, {
      "finance.petty_cash": ["approve"],
    });
    const refused = await setPasswordOf(
      manager.cookie,
      stronger.memberId,
      FIRST_PASSWORD,
    );
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json(refused)).toMatchObject({ code: "CANNOT_GRANT" });

    const own = await setPasswordOf(
      manager.cookie,
      manager.memberId,
      FIRST_PASSWORD,
    );
    expect(own.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json(own)).toMatchObject({ code: "OWN_ROLE" });

    const weaker = await memberWith(owner, {});
    const allowed = await setPasswordOf(
      manager.cookie,
      weaker.memberId,
      FIRST_PASSWORD,
    );
    expect(allowed.status).toBe(StatusCodes.OK);
  });

  it("refuses a User another Company relies on, and the Owner", async () => {
    const owner = await ownerWithCompany();
    const other = await ownerWithCompany("Sri Infra");
    const member = await memberWith(owner, {});
    await seedCompanyMember({
      workspaceId: other.workspaceId,
      userId: member.userId,
      role: "member",
    });
    const shown = await json<Member>(
      await getOne(
        jsonRequest(`${BASE}/${member.memberId}`, owner.cookie),
        params(member.memberId),
      ),
    );
    expect(shown.canSetPassword).toBe(false);
    const elsewhere = await setPasswordOf(
      owner.cookie,
      member.memberId,
      FIRST_PASSWORD,
    );
    expect(elsewhere.status).toBe(StatusCodes.CONFLICT);
    expect(await json(elsewhere)).toMatchObject({
      code: "USER_IN_OTHER_COMPANY",
    });

    const page = await json<{ items: (Member & { isOwner: boolean })[] }>(
      await list(jsonRequest(BASE, owner.cookie)),
    );
    const self = page.items.find((item) => item.isOwner);
    const ownPassword = await setPasswordOf(
      owner.cookie,
      self?.id ?? "",
      FIRST_PASSWORD,
    );
    expect(ownPassword.status).toBe(StatusCodes.CONFLICT);
    expect(await json(ownPassword)).toMatchObject({ code: "OWNER_PASSWORD" });

    const short = await setPasswordOf(owner.cookie, member.memberId, "short");
    expect(short.status).toBe(StatusCodes.BAD_REQUEST);
  });

  it("needs Team Members update", async () => {
    const owner = await ownerWithCompany();
    const viewer = await memberWith(owner, {
      "organization.team_members": ["read"],
    });
    const target = await memberWith(owner, {});
    const refused = await setPasswordOf(
      viewer.cookie,
      target.memberId,
      FIRST_PASSWORD,
    );
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
  });
});
