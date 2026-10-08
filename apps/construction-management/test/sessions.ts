import { randomInt } from "node:crypto";

import { POST as authPost } from "@/app/api/auth/[...all]/route";

export const TEST_ORIGIN = "http://localhost:3002";
/** Matches OTP_TEST_CODE in vitest.config.ts. */
export const TEST_OTP = "246810";

/** A fresh valid Indian mobile, so per-mobile limits never collide. */
export function newMobile(): string {
  return `+919${String(randomInt(100_000_000, 999_999_999))}`;
}

/**
 * Signs a User in by mobile OTP through the real auth routes and returns
 * the session cookie header plus the User id.
 */
export async function signInByMobile(mobile = newMobile()): Promise<{
  cookie: string;
  userId: string;
  mobile: string;
}> {
  const post = (path: string, body: unknown) =>
    authPost(
      new Request(`${TEST_ORIGIN}/api/auth${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: TEST_ORIGIN },
        body: JSON.stringify(body),
      }),
    );
  await post("/phone-number/send-otp", { phoneNumber: mobile });
  const verified = await post("/phone-number/verify", {
    phoneNumber: mobile,
    code: TEST_OTP,
  });
  if (!verified.ok)
    throw new Error(`Mobile sign-in failed: ${String(verified.status)}`);
  const cookie = verified.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  const body = (await verified.json()) as { user: { id: string } };
  return { cookie, userId: body.user.id, mobile };
}
