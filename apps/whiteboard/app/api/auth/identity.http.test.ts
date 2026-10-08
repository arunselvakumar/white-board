import { prisma } from "@repo/db";
import {
  WorkspaceAccessError,
  getAuthFromHeaders,
  workspaces,
} from "@repo/auth/server";
import {
  clearOutbox,
  emailsTo,
  lastCodeFor,
  lastInvitationIdFor,
  outbox,
} from "@repo/auth/testing";
import { beforeEach, describe, expect, it } from "vitest";

import { TestBrowser, newIdentity } from "./auth-test-client";

type Person = ReturnType<typeof newIdentity>;

beforeEach(() => {
  clearOutbox();
});

async function signUp(browser: TestBrowser, person: Person) {
  return browser.auth("/sign-up/email", {
    email: person.email,
    password: person.password,
    name: person.name,
    username: person.username,
  });
}

/** Signs up and verifies the emailed code; the browser ends signed in. */
async function verifiedUser(prefix = "user") {
  const browser = new TestBrowser();
  const person = newIdentity(prefix);
  expect((await signUp(browser, person)).status).toBe(200);
  const verify = await browser.auth("/email-otp/verify-email", {
    email: person.email,
    otp: lastCodeFor(person.email),
  });
  expect(verify.status).toBe(200);
  const user = await prisma.identityUser.findUniqueOrThrow({
    where: { email: person.email },
  });
  return { browser, person, userId: user.id };
}

/** A verified User who owns a new Workspace and has it active. */
async function owner() {
  const account = await verifiedUser("owner");
  const workspace = await workspaces.create({
    name: `Centre ${account.person.username}`,
    institutionType: "training_institute",
    ownerUserId: account.userId,
  });
  const active = await account.browser.auth("/organization/set-active", {
    organizationId: workspace.id,
  });
  expect(active.status).toBe(200);
  return { ...account, workspaceId: workspace.id };
}

async function errorCode(response: Response): Promise<string | undefined> {
  const body = (await response.json()) as { code?: string };
  return body.code;
}

describe("Sign-up and Email Verification", () => {
  it("does not sign in until the email is verified", async () => {
    const browser = new TestBrowser();
    const person = newIdentity();
    await signUp(browser, person);

    const byEmail = await browser.auth("/sign-in/email", {
      email: person.email,
      password: person.password,
    });
    expect(byEmail.status).toBe(403);
    expect(await errorCode(byEmail)).toBe("EMAIL_NOT_VERIFIED");

    const byUsername = await browser.auth("/sign-in/username", {
      username: person.username,
      password: person.password,
    });
    expect(byUsername.status).toBe(403);
    expect(await errorCode(byUsername)).toBe("EMAIL_NOT_VERIFIED");
    expect(browser.hasSession).toBe(false);
  });

  it("rejects a wrong code and then accepts the right one", async () => {
    const browser = new TestBrowser();
    const person = newIdentity();
    await signUp(browser, person);
    const code = lastCodeFor(person.email);
    const wrong = code === "000000" ? "111111" : "000000";

    const rejected = await browser.auth("/email-otp/verify-email", {
      email: person.email,
      otp: wrong,
    });
    expect(rejected.status).toBe(400);
    expect(await errorCode(rejected)).toBe("INVALID_OTP");

    const accepted = await browser.auth("/email-otp/verify-email", {
      email: person.email,
      otp: code,
    });
    expect(accepted.status).toBe(200);
  });

  it("stores the code hashed, never as sent", async () => {
    const browser = new TestBrowser();
    const person = newIdentity();
    await signUp(browser, person);
    const code = lastCodeFor(person.email);
    const rows = await prisma.identityVerification.findMany({
      where: { identifier: { contains: person.email } },
    });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.value).not.toContain(code);
  });

  it("signs in by email or by username once verified", async () => {
    const { person } = await verifiedUser();
    const byEmail = await new TestBrowser().auth("/sign-in/email", {
      email: person.email,
      password: person.password,
    });
    expect(byEmail.status).toBe(200);
    const byUsername = await new TestBrowser().auth("/sign-in/username", {
      username: person.username,
      password: person.password,
    });
    expect(byUsername.status).toBe(200);
  });

  it("rejects a wrong password without saying which part was wrong", async () => {
    const { person } = await verifiedUser();
    const response = await new TestBrowser().auth("/sign-in/email", {
      email: person.email,
      password: "not-the-password",
    });
    expect(response.status).toBe(401);
    expect(await errorCode(response)).toBe("INVALID_EMAIL_OR_PASSWORD");
  });

  it("rejects a taken username", async () => {
    const { person } = await verifiedUser();
    const response = await signUp(new TestBrowser(), {
      ...newIdentity(),
      username: person.username,
    });
    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe("USERNAME_IS_ALREADY_TAKEN");
  });

  it("never creates a second User for an email in use", async () => {
    const { person } = await verifiedUser();
    await signUp(new TestBrowser(), { ...newIdentity(), email: person.email });
    expect(
      await prisma.identityUser.count({ where: { email: person.email } }),
    ).toBe(1);
  });

  it("rejects a password shorter than 8 characters", async () => {
    const response = await signUp(new TestBrowser(), {
      ...newIdentity(),
      password: "short",
    });
    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe("PASSWORD_TOO_SHORT");
  });
});

describe("Sessions", () => {
  it("ends the Session on sign-out, even for a copied cookie", async () => {
    const { browser } = await verifiedUser();
    const copied = browser.headers();
    expect((await getAuthFromHeaders(copied)).isAuthenticated).toBe(true);
    await browser.auth("/sign-out", {});
    expect((await getAuthFromHeaders(copied)).isAuthenticated).toBe(false);
  });

  it("resets the password by code and signs out every Session", async () => {
    const { browser, person } = await verifiedUser();
    const before = browser.headers();
    const other = new TestBrowser();
    expect(
      (
        await other.auth("/email-otp/request-password-reset", {
          email: person.email,
        })
      ).status,
    ).toBe(200);
    const newPassword = `${person.password}-new`;
    const reset = await other.auth("/email-otp/reset-password", {
      email: person.email,
      otp: lastCodeFor(person.email),
      password: newPassword,
    });
    expect(reset.status).toBe(200);

    expect((await getAuthFromHeaders(before)).isAuthenticated).toBe(false);
    const oldPassword = await new TestBrowser().auth("/sign-in/email", {
      email: person.email,
      password: person.password,
    });
    expect(oldPassword.status).toBe(401);
    const newSignIn = await new TestBrowser().auth("/sign-in/email", {
      email: person.email,
      password: newPassword,
    });
    expect(newSignIn.status).toBe(200);
  });

  it("rate limits repeated sign-in attempts from one address", async () => {
    const { person } = await verifiedUser();
    const browser = new TestBrowser();
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await browser.auth("/sign-in/email", {
        email: person.email,
        password: "wrong-password",
      });
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 10).every((status) => status === 401)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });
});

describe("Workspaces and roles", () => {
  it("makes the creator the Owner and keeps the Institution Type", async () => {
    const { browser, userId, workspaceId } = await owner();
    const state = await getAuthFromHeaders(browser.headers());
    expect(state).toMatchObject({
      isAuthenticated: true,
      userId,
      workspaceId,
      role: "owner",
    });
    const workspace = await prisma.identityWorkspace.findUniqueOrThrow({
      where: { id: workspaceId },
    });
    expect(workspace.institutionType).toBe("training_institute");
  });

  it("offers Workspace Creation only to a User with no Workspace", async () => {
    const { userId } = await owner();
    await expect(
      workspaces.create({
        name: "Second centre",
        institutionType: "training_institute",
        ownerUserId: userId,
      }),
    ).rejects.toBeInstanceOf(WorkspaceAccessError);
  });

  it("rejects an Institution Type that is not available", async () => {
    const { userId } = await verifiedUser();
    await expect(
      workspaces.create({
        name: "A school",
        institutionType: "school" as "training_institute",
        ownerUserId: userId,
      }),
    ).rejects.toThrow();
    expect(
      await prisma.identityWorkspaceMember.count({ where: { userId } }),
    ).toBe(0);
  });

  it("does not let a User activate a Workspace they don't belong to", async () => {
    const first = await owner();
    const stranger = await verifiedUser();
    const response = await stranger.browser.auth("/organization/set-active", {
      organizationId: first.workspaceId,
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
    const state = await getAuthFromHeaders(stranger.browser.headers());
    expect(state.workspaceId).toBeNull();
    expect(state.role).toBeNull();
  });

  it("lists only the User's own Workspaces", async () => {
    const first = await owner();
    await owner();
    const response = await first.browser.auth("/organization/list");
    const list = (await response.json()) as { id: string }[];
    expect(list.map((workspace) => workspace.id)).toEqual([first.workspaceId]);
  });

  it("never lets anyone invite a second Owner", async () => {
    const { userId, workspaceId } = await owner();
    await expect(
      workspaces.invite({
        workspaceId,
        inviterUserId: userId,
        email: newIdentity().email,
        role: "owner" as "teacher",
      }),
    ).rejects.toMatchObject({ code: "INVALID_ROLE" });
  });

  it("does not let a Teacher send invitations", async () => {
    const team = await owner();
    const teacher = await verifiedUser("teacher");
    await prisma.identityWorkspaceMember.create({
      data: {
        id: `member_${teacher.userId}`,
        organizationId: team.workspaceId,
        userId: teacher.userId,
        role: "teacher",
        createdAt: new Date(),
      },
    });
    await expect(
      workspaces.invite({
        workspaceId: team.workspaceId,
        inviterUserId: teacher.userId,
        email: newIdentity().email,
        role: "student",
      }),
    ).rejects.toMatchObject({ code: "NOT_WORKSPACE_OWNER" });
  });
});

describe("Invitations", () => {
  async function invite(
    from: Awaited<ReturnType<typeof owner>>,
    role: "teacher" | "student" | "parent",
    email = newIdentity(role).email,
  ) {
    const result = await workspaces.invite({
      workspaceId: from.workspaceId,
      inviterUserId: from.userId,
      email,
      role,
    });
    return { result, email };
  }

  it("emails a link and accepts it for the verified invited User", async () => {
    const team = await owner();
    const person = newIdentity("student");
    const { result } = await invite(team, "student", person.email);
    expect(result.status).toBe("sent");
    const invitationId = lastInvitationIdFor(person.email);
    expect(emailsTo(person.email).at(-1)?.text).toContain(
      "http://localhost:3000/accept-invitation?id=",
    );

    const preview = await workspaces.previewInvitation(invitationId);
    expect(preview).toMatchObject({
      email: person.email,
      role: "student",
      hasAccount: false,
    });

    const browser = new TestBrowser();
    await signUp(browser, person);
    await browser.auth("/email-otp/verify-email", {
      email: person.email,
      otp: lastCodeFor(person.email),
    });
    const accepted = await browser.auth("/organization/accept-invitation", {
      invitationId,
    });
    expect(accepted.status).toBe(200);

    const state = await getAuthFromHeaders(browser.headers());
    expect(state).toMatchObject({
      workspaceId: team.workspaceId,
      role: "student",
    });
    expect(await workspaces.previewInvitation(invitationId)).toBeNull();

    const again = await browser.auth("/organization/accept-invitation", {
      invitationId,
    });
    expect(again.status).toBe(400);
  });

  it("treats a second invitation to the same email as already sent", async () => {
    const team = await owner();
    const { email } = await invite(team, "parent");
    const second = await invite(team, "parent", email);
    expect(second.result.status).toBe("already_pending");
    expect(emailsTo(email)).toHaveLength(1);
    expect(
      await prisma.identityWorkspaceInvitation.count({
        where: { email, status: "pending" },
      }),
    ).toBe(1);
  });

  it("does not invite an email that is already a member", async () => {
    const team = await owner();
    const { result } = await invite(team, "teacher", team.person.email);
    expect(result.status).toBe("already_member");
    expect(
      emailsTo(team.person.email).filter((email) =>
        email.text.includes("accept-invitation"),
      ),
    ).toHaveLength(0);
  });

  it("refuses the invitation for a User with another email", async () => {
    const team = await owner();
    await invite(team, "student");
    const invitationId = lastInvitationIdFor(outboxAddressOfLastInvitation());
    const stranger = await verifiedUser();
    const response = await stranger.browser.auth(
      "/organization/accept-invitation",
      { invitationId },
    );
    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe(
      "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION",
    );
    expect(
      (await getAuthFromHeaders(stranger.browser.headers())).workspaceId,
    ).toBeNull();
  });

  it("refuses a cancelled or expired invitation", async () => {
    const team = await owner();
    const cancelledPerson = newIdentity("cancelled");
    const expiredPerson = newIdentity("expired");
    const cancelled = await invite(team, "student", cancelledPerson.email);
    const expired = await invite(team, "student", expiredPerson.email);
    if (cancelled.result.status !== "sent" || expired.result.status !== "sent")
      throw new Error("Expected invitations to be sent.");
    await workspaces.cancelInvitation({
      workspaceId: team.workspaceId,
      invitationId: cancelled.result.invitationId,
    });
    await prisma.identityWorkspaceInvitation.update({
      where: { id: expired.result.invitationId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    for (const [person, invitationId] of [
      [cancelledPerson, cancelled.result.invitationId],
      [expiredPerson, expired.result.invitationId],
    ] as const) {
      expect(await workspaces.previewInvitation(invitationId)).toBeNull();
      const browser = new TestBrowser();
      await signUp(browser, person);
      await browser.auth("/email-otp/verify-email", {
        email: person.email,
        otp: lastCodeFor(person.email),
      });
      const response = await browser.auth("/organization/accept-invitation", {
        invitationId,
      });
      expect(response.status).toBe(400);
      expect(await errorCode(response)).toBe("INVITATION_NOT_FOUND");
    }
  });

  it("takes access away on the very next request when a member is removed", async () => {
    const team = await owner();
    const person = newIdentity("teacher");
    await invite(team, "teacher", person.email);
    const invitationId = lastInvitationIdFor(person.email);
    const browser = new TestBrowser();
    await signUp(browser, person);
    await browser.auth("/email-otp/verify-email", {
      email: person.email,
      otp: lastCodeFor(person.email),
    });
    await browser.auth("/organization/accept-invitation", { invitationId });
    const before = await getAuthFromHeaders(browser.headers());
    expect(before.role).toBe("teacher");
    if (before.userId == null) throw new Error("Expected a Session.");

    await workspaces.removeMember({
      workspaceId: team.workspaceId,
      userId: before.userId,
    });
    const after = await getAuthFromHeaders(browser.headers());
    expect(after).toMatchObject({
      isAuthenticated: true,
      workspaceId: null,
      role: null,
    });
  });

  it("never removes the Owner", async () => {
    const team = await owner();
    await workspaces.removeMember({
      workspaceId: team.workspaceId,
      userId: team.userId,
    });
    const state = await getAuthFromHeaders(team.browser.headers());
    expect(state.role).toBe("owner");
  });
});

/** The address of the newest invitation email in the outbox. */
function outboxAddressOfLastInvitation(): string {
  const last = [...outbox]
    .reverse()
    .find((email) => email.text.includes("accept-invitation?id="));
  if (last == null) throw new Error("No invitation email was sent.");
  return last.to;
}
