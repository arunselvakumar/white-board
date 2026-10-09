import { prisma } from "@repo/construction-db";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { phoneNumber } from "better-auth/plugins";

import { isLiveProduction } from "../runtime";
import { isValidMobile, placeholderEmailFor } from "./mobile";
import type { SmsSender } from "./sms";

/** Mobile sign-in codes (ADR CM-0002). */
export const MOBILE_OTP_LENGTH = 6;
export const MOBILE_OTP_EXPIRES_IN_SECONDS = 5 * 60;
export const MOBILE_OTP_ALLOWED_ATTEMPTS = 5;
/** Codes one mobile may be sent per window, whatever the IP. */
export const MOBILE_OTP_SENDS_PER_WINDOW = 5;
export const MOBILE_OTP_SEND_WINDOW_SECONDS = 15 * 60;

/**
 * The development, test and preview bypass code. Never honoured in live
 * production (previews have their own database), and the server refuses to
 * start if it is set there.
 */
export function otpTestCode(): string | null {
  const code = process.env["OTP_TEST_CODE"];
  if (code == null || code.length === 0) return null;
  if (isLiveProduction()) {
    // `next build` runs with NODE_ENV=production and a developer's .env;
    // it never verifies a code, so the bypass is simply off while building.
    if (process.env["NEXT_PHASE"] === "phase-production-build") return null;
    throw new Error("OTP_TEST_CODE must not be set in production.");
  }
  if (!/^\d{6}$/.test(code))
    throw new Error("OTP_TEST_CODE must be six digits.");
  return code;
}

type VerifyContext = {
  context: {
    internalAdapter: {
      findVerificationValue(
        identifier: string,
      ): Promise<{ value: string; expiresAt: Date } | null>;
      consumeVerificationValue(
        identifier: string,
      ): Promise<{ value: string; expiresAt: Date } | null>;
      createVerificationValue(data: {
        value: string;
        identifier: string;
        expiresAt: Date;
      }): Promise<unknown>;
      deleteVerificationByIdentifier(identifier: string): Promise<void>;
    };
  };
};

function attemptsOf(raw: string | undefined): number {
  const attempts = Number(raw ?? 0);
  return Number.isSafeInteger(attempts) && attempts > 0 ? attempts : 0;
}

/**
 * Better Auth's own check (expiry, attempts, one-time use), plus the test
 * bypass code. Mirrors `verifyPhoneNumberOTP` in better-auth 1.7.
 */
async function verifyCode(
  ctx: VerifyContext,
  mobile: string,
  code: string,
  testCode: string | null,
): Promise<boolean> {
  if (testCode != null && code === testCode) return true;
  const adapter = ctx.context.internalAdapter;
  const existing = await adapter.findVerificationValue(mobile);
  if (existing == null)
    throw new APIError("BAD_REQUEST", {
      code: "OTP_NOT_FOUND",
      message: "Ask for a new code.",
    });
  if (existing.expiresAt < new Date()) {
    await adapter.deleteVerificationByIdentifier(mobile);
    throw new APIError("BAD_REQUEST", {
      code: "OTP_EXPIRED",
      message: "This code has expired. Ask for a new one.",
    });
  }
  if (attemptsOf(existing.value.split(":")[1]) >= MOBILE_OTP_ALLOWED_ATTEMPTS) {
    await adapter.deleteVerificationByIdentifier(mobile);
    throw new APIError("FORBIDDEN", {
      code: "TOO_MANY_ATTEMPTS",
      message: "Too many wrong codes. Ask for a new one.",
    });
  }
  const consumed = await adapter.consumeVerificationValue(mobile);
  if (consumed == null) return false;
  const [expected, rawAttempts] = consumed.value.split(":");
  const attempts = attemptsOf(rawAttempts);
  if (expected === code) return true;
  await adapter.createVerificationValue({
    value: `${expected ?? ""}:${String(attempts + 1)}`,
    identifier: mobile,
    expiresAt: consumed.expiresAt,
  });
  return false;
}

/**
 * At most `MOBILE_OTP_SENDS_PER_WINDOW` codes per mobile per window, counted
 * in `identity.rate_limits`. Better Auth's own limits are per IP.
 */
export function perMobileOtpLimit(): BetterAuthPlugin {
  return {
    id: "construction-per-mobile-otp-limit",
    hooks: {
      before: [
        {
          matcher: (context) => context.path === "/phone-number/send-otp",
          handler: createAuthMiddleware(async (ctx) => {
            const body = ctx.body as { phoneNumber?: unknown } | undefined;
            const mobile = body?.phoneNumber;
            if (typeof mobile !== "string") return;
            const key = `mobile-otp:${mobile}`;
            const now = Date.now();
            const windowStart = now - MOBILE_OTP_SEND_WINDOW_SECONDS * 1000;
            const row = await prisma.identityRateLimit.findUnique({
              where: { key },
            });
            if (row == null || Number(row.lastRequest) < windowStart) {
              await prisma.identityRateLimit.upsert({
                where: { key },
                create: {
                  id: key,
                  key,
                  count: 1,
                  lastRequest: BigInt(now),
                },
                update: { count: 1, lastRequest: BigInt(now) },
              });
              return;
            }
            if (row.count >= MOBILE_OTP_SENDS_PER_WINDOW)
              throw new APIError("TOO_MANY_REQUESTS", {
                code: "TOO_MANY_CODES",
                message:
                  "Too many codes for this number. Try again in 15 minutes.",
              });
            // The window runs from the first code in it.
            await prisma.identityRateLimit.update({
              where: { key },
              data: { count: { increment: 1 } },
            });
          }),
        },
      ],
    },
  };
}

/** Better Auth's `phoneNumber` plugin configured for Construction Management. */
export function mobileOtp(sms: SmsSender) {
  const testCode = otpTestCode();
  return phoneNumber({
    otpLength: MOBILE_OTP_LENGTH,
    expiresIn: MOBILE_OTP_EXPIRES_IN_SECONDS,
    allowedAttempts: MOBILE_OTP_ALLOWED_ATTEMPTS,
    phoneNumberValidator: (value) => isValidMobile(value),
    async sendOTP({ phoneNumber: to, code }) {
      await sms.send({
        to,
        code,
        text: `${code} is your Construction Management sign-in code. It expires in 5 minutes. Do not share it.`,
      });
    },
    verifyOTP: ({ phoneNumber: mobile, code }, ctx) =>
      verifyCode(ctx as unknown as VerifyContext, mobile, code, testCode),
    signUpOnVerification: {
      getTempEmail: placeholderEmailFor,
      getTempName: (mobile) => mobile,
    },
  });
}
