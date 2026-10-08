import { randomInt } from "node:crypto";

import { lastSmsCodeFor, smsOutbox } from "@repo/auth/construction/testing";
import { prisma } from "@repo/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { withSms } from "@/test/sessions";

import { POST } from "./[...all]/route";

const ORIGIN = "http://localhost:3002";

/** A fresh valid Indian mobile per test, so per-mobile limits never collide. */
function newMobile(): string {
  return `+919${String(randomInt(100_000_000, 999_999_999))}`;
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

describe("mobile OTP while SMS is off (ADR CM-0009)", () => {
  it("answers 404 and texts nothing", async () => {
    smsOutbox.length = 0;
    const mobile = newMobile();
    const sent = await authPost("/phone-number/send-otp", {
      phoneNumber: mobile,
    });
    expect(sent.status).toBe(404);
    const verified = await authPost("/phone-number/verify", {
      phoneNumber: mobile,
      code: "246810",
    });
    expect(verified.status).toBe(404);
    expect(smsOutbox).toEqual([]);
  });
});

describe("mobile OTP sign-in while SMS is on (CM-102)", () => {
  const sms = withSms();
  beforeAll(sms.on);
  afterAll(sms.off);
  beforeEach(() => {
    smsOutbox.length = 0;
  });

  it("texts a 6-digit code and signs a new User up on verify", async () => {
    const mobile = newMobile();
    const sent = await authPost("/phone-number/send-otp", {
      phoneNumber: mobile,
    });
    expect(sent.status).toBe(200);
    const code = await lastSmsCodeFor(mobile);
    expect(code).toMatch(/^\d{6}$/);
    expect(smsOutbox.at(-1)?.text).toContain(code);

    const verified = await authPost("/phone-number/verify", {
      phoneNumber: mobile,
      code,
    });
    expect(verified.status).toBe(200);
    expect(verified.headers.get("set-cookie")).toContain(
      "construction.session_token=",
    );
    const user = await prisma.identityUser.findUnique({
      where: { phoneNumber: mobile },
    });
    expect(user).toMatchObject({
      phoneNumberVerified: true,
      email: `${mobile.slice(1)}@mobile.invalid`,
    });

    // The code works once.
    const again = await authPost("/phone-number/verify", {
      phoneNumber: mobile,
      code,
    });
    expect(again.status).toBe(400);
  });

  it("signs an existing User in with a new code", async () => {
    const mobile = newMobile();
    await authPost("/phone-number/send-otp", { phoneNumber: mobile });
    await authPost("/phone-number/verify", {
      phoneNumber: mobile,
      code: await lastSmsCodeFor(mobile),
    });
    await authPost("/phone-number/send-otp", { phoneNumber: mobile });
    const second = await authPost("/phone-number/verify", {
      phoneNumber: mobile,
      code: await lastSmsCodeFor(mobile),
    });
    expect(second.status).toBe(200);
    await expect(
      prisma.identityUser.count({ where: { phoneNumber: mobile } }),
    ).resolves.toBe(1);
  });

  it("rejects a number that is not a valid mobile", async () => {
    const response = await authPost("/phone-number/send-otp", {
      phoneNumber: "+9112345",
    });
    expect(response.status).toBe(400);
    expect(smsOutbox).toHaveLength(0);
  });

  it("rejects an expired code", async () => {
    const mobile = newMobile();
    await authPost("/phone-number/send-otp", { phoneNumber: mobile });
    const code = await lastSmsCodeFor(mobile);
    await prisma.identityVerification.updateMany({
      where: { identifier: mobile },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const response = await authPost("/phone-number/verify", {
      phoneNumber: mobile,
      code,
    });
    expect(response.status).toBe(400);
    expect(await json<ErrorJson>(response)).toMatchObject({
      code: "OTP_EXPIRED",
    });
  });

  it("locks the code after five wrong attempts", async () => {
    const mobile = newMobile();
    await authPost("/phone-number/send-otp", { phoneNumber: mobile });
    const code = await lastSmsCodeFor(mobile);
    const wrong = code === "111111" ? "222222" : "111111";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await authPost("/phone-number/verify", {
        phoneNumber: mobile,
        code: wrong,
      });
      expect(response.status).toBe(400);
    }
    const locked = await authPost("/phone-number/verify", {
      phoneNumber: mobile,
      code,
    });
    expect(locked.status).toBe(403);
    expect(await json<ErrorJson>(locked)).toMatchObject({
      code: "TOO_MANY_ATTEMPTS",
    });
  });

  it("sends at most five codes to one mobile per 15 minutes", async () => {
    const mobile = newMobile();
    for (let send = 0; send < 5; send += 1) {
      const response = await authPost("/phone-number/send-otp", {
        phoneNumber: mobile,
      });
      expect(response.status).toBe(200);
    }
    const sixth = await authPost("/phone-number/send-otp", {
      phoneNumber: mobile,
    });
    expect(sixth.status).toBe(429);
    expect(await json<ErrorJson>(sixth)).toMatchObject({
      code: "TOO_MANY_CODES",
    });
    expect(smsOutbox).toHaveLength(5);
  });

  it("accepts the test bypass code outside production", async () => {
    const mobile = newMobile();
    await authPost("/phone-number/send-otp", { phoneNumber: mobile });
    const response = await authPost("/phone-number/verify", {
      phoneNumber: mobile,
      code: "246810",
    });
    expect(response.status).toBe(200);
  });
});
