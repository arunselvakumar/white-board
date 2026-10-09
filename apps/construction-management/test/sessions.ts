import { randomInt, randomUUID } from "node:crypto";

import { outbox } from "@repo/auth/construction/testing";
import { prisma } from "@repo/construction-db";

import { POST as authPost } from "@/app/api/auth/[...all]/route";

export const TEST_ORIGIN = "http://localhost:3002";
/** Matches OTP_TEST_CODE in vitest.config.ts. */
export const TEST_OTP = "246810";

/** A fresh valid Indian mobile, so per-mobile limits never collide. */
export function newMobile(): string {
  return `+919${String(randomInt(100_000_000, 999_999_999))}`;
}

export const TEST_PASSWORD = "site-pass-1234";

/** A fresh email, so accounts and member contacts never collide. */
export function newEmail(): string {
  return `user-${randomUUID().slice(0, 12)}@example.test`;
}

function postAuth(path: string, body: unknown): Promise<Response> {
  return authPost(
    new Request(`${TEST_ORIGIN}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: TEST_ORIGIN },
      body: JSON.stringify(body),
    }),
  );
}

function sessionCookie(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
}

/** The newest 6-digit code emailed to `email`. */
export function lastEmailCodeFor(email: string): string {
  const sent = outbox.filter((mail) => mail.to === email).at(-1);
  const code = sent?.text.match(/\b(\d{6})\b/)?.[1];
  if (code == null) throw new Error(`No code was emailed to ${email}.`);
  return code;
}

/**
 * Signs a new User up by email and password through the real auth routes
 * (the sign-in while SMS is off, ADR CM-0009), verifies the emailed code,
 * and returns the session cookie header plus the User id.
 */
export async function signInByEmail(
  email = newEmail(),
  name = "Arun Selva Kumar",
): Promise<{ cookie: string; userId: string; email: string }> {
  const signedUp = await postAuth("/sign-up/email", {
    email,
    password: TEST_PASSWORD,
    name,
  });
  if (!signedUp.ok)
    throw new Error(`Email sign-up failed: ${String(signedUp.status)}`);
  const verified = await postAuth("/email-otp/verify-email", {
    email,
    otp: lastEmailCodeFor(email),
  });
  if (!verified.ok)
    throw new Error(`Email verification failed: ${String(verified.status)}`);
  const user = await prisma.identityUser.findUniqueOrThrow({
    where: { email },
  });
  return { cookie: sessionCookie(verified), userId: user.id, email };
}

/**
 * Signs a User in by mobile OTP through the real auth routes and returns
 * the session cookie header plus the User id. Only while SMS is on
 * (`withSms`); every other test signs in by email.
 */
export async function signInByMobile(mobile = newMobile()): Promise<{
  cookie: string;
  userId: string;
  mobile: string;
}> {
  const post = postAuth;
  await post("/phone-number/send-otp", { phoneNumber: mobile });
  const verified = await post("/phone-number/verify", {
    phoneNumber: mobile,
    code: TEST_OTP,
  });
  if (!verified.ok)
    throw new Error(`Mobile sign-in failed: ${String(verified.status)}`);
  const body = (await verified.json()) as { user: { id: string } };
  return { cookie: sessionCookie(verified), userId: body.user.id, mobile };
}

/** Turns SMS (mobile OTP, SMS invitations) on for the tests in a block. */
export function withSms(): { on: () => void; off: () => void } {
  const previous = process.env["CONSTRUCTION_SMS"];
  return {
    on: () => {
      process.env["CONSTRUCTION_SMS"] = "on";
    },
    off: () => {
      if (previous === undefined) delete process.env["CONSTRUCTION_SMS"];
      else process.env["CONSTRUCTION_SMS"] = previous;
    },
  };
}
