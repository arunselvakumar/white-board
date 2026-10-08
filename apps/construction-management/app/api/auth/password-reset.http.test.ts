import { randomUUID } from "node:crypto";

import { outbox } from "@repo/auth/construction/testing";
import { prisma } from "@repo/db";
import { beforeEach, describe, expect, it } from "vitest";

import { POST } from "./[...all]/route";

const ORIGIN = "http://localhost:3002";
const OLD_PASSWORD = "site-pass-1234";
const NEW_PASSWORD = "new-site-pass-5678";

function newEmail(): string {
  return `reset-${randomUUID().slice(0, 12)}@example.test`;
}

function authPost(path: string, body: unknown): Promise<Response> {
  return POST(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify(body),
    }),
  );
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

type ErrorJson = { code?: string; message?: string };

/** The newest 6-digit code emailed to `email`. */
function lastEmailCodeFor(email: string): string {
  const sent = outbox.filter((mail) => mail.to === email).at(-1);
  const code = sent?.text.match(/\b(\d{6})\b/)?.[1];
  if (code == null) throw new Error(`No code was emailed to ${email}.`);
  return code;
}

/** Signs a User up by email and verifies the emailed code. */
async function signUpVerified(email: string): Promise<void> {
  const signedUp = await authPost("/sign-up/email", {
    email,
    password: OLD_PASSWORD,
    name: "Ramesh Patil",
  });
  expect(signedUp.status).toBe(200);
  const verified = await authPost("/email-otp/verify-email", {
    email,
    otp: lastEmailCodeFor(email),
  });
  expect(verified.status).toBe(200);
}

function signIn(email: string, password: string): Promise<Response> {
  return authPost("/sign-in/email", { email, password });
}

describe("forgot password by emailed code", () => {
  beforeEach(() => {
    outbox.length = 0;
  });

  it("resets the password with the emailed code and signs out every Session", async () => {
    const email = newEmail();
    await signUpVerified(email);
    const user = await prisma.identityUser.findUniqueOrThrow({
      where: { email },
    });
    await expect(
      prisma.identitySession.count({ where: { userId: user.id } }),
    ).resolves.toBeGreaterThan(0);

    const requested = await authPost("/email-otp/request-password-reset", {
      email,
    });
    expect(requested.status).toBe(200);
    const code = lastEmailCodeFor(email);
    expect(code).toMatch(/^\d{6}$/);

    const reset = await authPost("/email-otp/reset-password", {
      email,
      otp: code,
      password: NEW_PASSWORD,
    });
    expect(reset.status).toBe(200);
    await expect(
      prisma.identitySession.count({ where: { userId: user.id } }),
    ).resolves.toBe(0);

    const oldPassword = await signIn(email, OLD_PASSWORD);
    expect(oldPassword.status).toBe(401);
    expect(await json<ErrorJson>(oldPassword)).toMatchObject({
      code: "INVALID_EMAIL_OR_PASSWORD",
    });
    const newPassword = await signIn(email, NEW_PASSWORD);
    expect(newPassword.status).toBe(200);
    expect(newPassword.headers.get("set-cookie")).toContain(
      "construction.session_token=",
    );

    // The code works once.
    const again = await authPost("/email-otp/reset-password", {
      email,
      otp: code,
      password: "another-pass-9012",
    });
    expect(again.status).toBe(400);
  });

  it("refuses a wrong code and keeps the old password", async () => {
    const email = newEmail();
    await signUpVerified(email);
    await authPost("/email-otp/request-password-reset", { email });
    const code = lastEmailCodeFor(email);
    const wrong = code === "111111" ? "222222" : "111111";

    const response = await authPost("/email-otp/reset-password", {
      email,
      otp: wrong,
      password: NEW_PASSWORD,
    });
    expect(response.status).toBe(400);
    expect(await json<ErrorJson>(response)).toMatchObject({
      code: "INVALID_OTP",
    });
    expect((await signIn(email, OLD_PASSWORD)).status).toBe(200);
    expect((await signIn(email, NEW_PASSWORD)).status).toBe(401);
  });

  it("refuses a new password shorter than 8 characters", async () => {
    const email = newEmail();
    await signUpVerified(email);
    await authPost("/email-otp/request-password-reset", { email });

    const response = await authPost("/email-otp/reset-password", {
      email,
      otp: lastEmailCodeFor(email),
      password: "short",
    });
    expect(response.status).toBe(400);
    expect(await json<ErrorJson>(response)).toMatchObject({
      code: "PASSWORD_TOO_SHORT",
    });
  });

  it("answers the same for an email with no account, and emails nothing", async () => {
    const response = await authPost("/email-otp/request-password-reset", {
      email: newEmail(),
    });
    expect(response.status).toBe(200);
    expect(await json<{ success?: boolean }>(response)).toEqual({
      success: true,
    });
    expect(outbox).toHaveLength(0);
  });
});
