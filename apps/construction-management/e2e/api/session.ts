import { randomInt, randomUUID } from "node:crypto";

import type { APIRequestContext, PlaywrightWorkerArgs } from "@playwright/test";

type Playwright = PlaywrightWorkerArgs["playwright"];

import { emailCodeFor } from "./mailpit";

/** Every account the tests create signs in with this password. */
export const PASSWORD = "site-pass-1234";

/** What an Owner sets for a new member, who must replace it (ADR CM-0030 §8). */
export const TEMPORARY_PASSWORD = "temp-pass-1234";

/** A fresh email, so accounts never collide across tests and runs. */
export function newEmail(prefix = "user"): string {
  return `${prefix}-${randomUUID().slice(0, 12)}@example.test`;
}

/** A fresh valid Indian mobile. */
export function newMobile(): string {
  return `+919${String(randomInt(100_000_000, 999_999_999))}`;
}

/** A unique suffix for names a test types and then looks for. */
export function unique(name: string): string {
  return `${name} ${randomUUID().slice(0, 6)}`;
}

/**
 * An API session that calls the app as a browser would: same origin, its
 * own cookie jar. Better Auth refuses a POST without a trusted Origin.
 */
export function newApiSession(
  playwright: Playwright,
  baseURL: string,
): Promise<APIRequestContext> {
  return playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { origin: baseURL },
  });
}

async function postAuth(
  request: APIRequestContext,
  path: string,
  body: unknown,
): Promise<unknown> {
  const response = await request.post(`/api/auth${path}`, { data: body });
  if (!response.ok())
    throw new Error(
      `POST /api/auth${path} → ${String(response.status())}: ${await response.text()}`,
    );
  return response.json();
}

/**
 * Signs a new User up by email and password through the real auth routes,
 * verifies the code Mailpit caught, and leaves `request` signed in.
 */
export async function signUpByEmail(
  request: APIRequestContext,
  account: { name: string; email: string; password?: string },
): Promise<{ userId: string }> {
  await postAuth(request, "/sign-up/email", {
    name: account.name,
    email: account.email,
    password: account.password ?? PASSWORD,
  });
  const verified = (await postAuth(request, "/email-otp/verify-email", {
    email: account.email,
    otp: await emailCodeFor(account.email),
  })) as { user: { id: string } };
  return { userId: verified.user.id };
}

/**
 * Signs an existing User in by email and password, then opens `/continue`,
 * which makes their only Company the Active Company (CM-103).
 */
export async function signInByEmail(
  request: APIRequestContext,
  email: string,
  password = PASSWORD,
): Promise<void> {
  await postAuth(request, "/sign-in/email", { email, password });
  await request.get("/continue", { maxRedirects: 0 });
}

/** Signs a User in by mobile and password (ADR CM-0030 §7). */
export async function signInByMobile(
  request: APIRequestContext,
  mobile: string,
  password = PASSWORD,
): Promise<void> {
  await postAuth(request, "/sign-in/phone-number", {
    phoneNumber: mobile,
    password,
  });
  await request.get("/continue", { maxRedirects: 0 });
}

/**
 * A member's first sign-in by mobile with the password the Owner set: they
 * choose `password` (ADR CM-0030 §8) and `request` stays signed in. (An
 * email the Owner typed is not verified, so it cannot sign in yet.)
 */
export async function signInFirstTime(
  request: APIRequestContext,
  mobile: string,
  password = PASSWORD,
): Promise<void> {
  await signInByMobile(request, mobile, TEMPORARY_PASSWORD);
  await postAuth(request, "/change-password", {
    currentPassword: TEMPORARY_PASSWORD,
    newPassword: password,
  });
  await request.get("/continue", { maxRedirects: 0 });
}
