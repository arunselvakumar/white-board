import { prisma } from "@repo/whiteboard-db";
import { clearOutbox, lastCodeFor } from "@repo/auth/testing";
import { beforeEach, describe, expect, it } from "vitest";

import { TestBrowser, newIdentity } from "./auth-test-client";

beforeEach(() => {
  clearOutbox();
});

describe("auth route", () => {
  it("signs up, verifies the email code, and reads the Session", async () => {
    const browser = new TestBrowser();
    const person = newIdentity();

    const signUp = await browser.auth("/sign-up/email", {
      email: person.email,
      password: person.password,
      name: person.name,
      username: person.username,
    });
    expect(signUp.status).toBe(200);
    expect(browser.hasSession).toBe(false);

    const row = await prisma.identityUser.findUnique({
      where: { email: person.email },
    });
    expect(row).toMatchObject({
      email: person.email,
      username: person.username,
      emailVerified: false,
    });

    const verify = await browser.auth("/email-otp/verify-email", {
      email: person.email,
      otp: lastCodeFor(person.email),
    });
    expect(verify.status).toBe(200);
    expect(browser.hasSession).toBe(true);

    const session = await browser.auth("/get-session");
    expect(session.status).toBe(200);
    const body = (await session.json()) as {
      user: { email: string; emailVerified: boolean };
    };
    expect(body.user).toMatchObject({
      email: person.email,
      emailVerified: true,
    });
  });

  it.each([
    "/organization/create",
    "/organization/list-members",
    "/organization/get-full-organization",
    "/organization/invite-member",
    "/organization/update-member-role",
    "/organization/delete",
    "/sign-in/email-otp",
    "/delete-user",
    "/update-user",
    "/change-email",
  ])("does not offer %s over HTTP", async (path) => {
    const response = await new TestBrowser().auth(path, {});
    expect(response.status).toBe(404);
  });
});
