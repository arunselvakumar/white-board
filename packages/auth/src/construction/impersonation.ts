import { createHmac, randomInt, randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";
import { renderCompanyCodeEmail } from "@repo/email-templates";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { constantTimeEqual } from "better-auth/crypto";
import * as z from "zod";

import type { EmailSender } from "../email/sender";
import {
  IMPERSONATION_ADMIN_DOMAIN,
  isImpersonationAdminEmail,
} from "./impersonation-email";

export const IMPERSONATION_CODE_EXPIRES_IN_SECONDS = 10 * 60;
export const IMPERSONATION_ALLOWED_ATTEMPTS = 5;
/** Codes one admin email may be sent per window, whatever the IP. */
export const IMPERSONATION_SENDS_PER_WINDOW = 5;
export const IMPERSONATION_SEND_WINDOW_SECONDS = 15 * 60;

export const IMPERSONATION_SEND_CODE_PATH = "/impersonation/send-code";
export const IMPERSONATION_VERIFY_PATH = "/impersonation/verify";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const adminEmail = z
  .string()
  .transform(normalizeEmail)
  .refine(isImpersonationAdminEmail, {
    message: `Use your @${IMPERSONATION_ADMIN_DOMAIN} email.`,
  });

const customerEmail = z.string().transform(normalizeEmail).pipe(z.email());

const sendCodeBody = z.object({ adminEmail, customerEmail });
const verifyBody = z.object({
  adminEmail,
  customerEmail,
  code: z.string().regex(/^\d{6}$/),
});

/** What `identity.verifications` holds for one pending code. */
type StoredCode = { hash: string; customerEmail: string; attempts: number };

function identifierFor(admin: string): string {
  return `impersonation:${admin}`;
}

function hashCode(secret: string, code: string): string {
  return createHmac("sha256", secret).update(code).digest("hex");
}

function parseStored(value: string): StoredCode | null {
  try {
    const parsed = JSON.parse(value) as Partial<StoredCode>;
    if (
      typeof parsed.hash !== "string" ||
      typeof parsed.customerEmail !== "string" ||
      typeof parsed.attempts !== "number"
    )
      return null;
    return parsed as StoredCode;
  } catch {
    return null;
  }
}

/**
 * At most `IMPERSONATION_SENDS_PER_WINDOW` codes per admin email per window,
 * counted in `identity.rate_limits`, like the per-mobile limit.
 */
async function limitSendsTo(admin: string): Promise<void> {
  const key = `impersonation:${admin}`;
  const now = Date.now();
  const windowStart = now - IMPERSONATION_SEND_WINDOW_SECONDS * 1000;
  const row = await prisma.identityRateLimit.findUnique({ where: { key } });
  if (row == null || Number(row.lastRequest) < windowStart) {
    await prisma.identityRateLimit.upsert({
      where: { key },
      create: { id: key, key, count: 1, lastRequest: BigInt(now) },
      update: { count: 1, lastRequest: BigInt(now) },
    });
    return;
  }
  if (row.count >= IMPERSONATION_SENDS_PER_WINDOW)
    throw new APIError("TOO_MANY_REQUESTS", {
      code: "TOO_MANY_CODES",
      message: "Too many codes for this email. Try again in 15 minutes.",
    });
  await prisma.identityRateLimit.update({
    where: { key },
    data: { count: { increment: 1 } },
  });
}

/**
 * "Sign in as" a customer (ADR CM-0029): any `@white-board.io` mailbox gets
 * a code for one customer email, and the code opens a normal Session for
 * that customer with `impersonatedBy` set. `OTP_TEST_CODE` never applies.
 */
export function impersonation(email: EmailSender) {
  return {
    id: "construction-impersonation",
    schema: {
      session: {
        fields: {
          impersonatedBy: {
            type: "string",
            required: false,
            input: false,
            fieldName: "impersonatedBy",
          },
        },
      },
    },
    endpoints: {
      /**
       * Emails the admin a code. Always 200, so this step never reveals
       * whether the customer email has an account.
       */
      sendImpersonationCode: createAuthEndpoint(
        IMPERSONATION_SEND_CODE_PATH,
        { method: "POST", body: sendCodeBody },
        async (ctx) => {
          const { adminEmail: admin, customerEmail: customer } = ctx.body;
          await limitSendsTo(admin);
          const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
          const identifier = identifierFor(admin);
          const adapter = ctx.context.internalAdapter;
          await adapter.deleteVerificationByIdentifier(identifier);
          await adapter.createVerificationValue({
            identifier,
            value: JSON.stringify({
              hash: hashCode(ctx.context.secret, code),
              customerEmail: customer,
              attempts: 0,
            } satisfies StoredCode),
            expiresAt: new Date(
              Date.now() + IMPERSONATION_CODE_EXPIRES_IN_SECONDS * 1000,
            ),
          });
          const rendered = await renderCompanyCodeEmail({
            code,
            purpose: "confirm-action",
            action: `sign in as ${customer}`,
            expiresInMinutes: IMPERSONATION_CODE_EXPIRES_IN_SECONDS / 60,
          });
          await email.send({ to: admin, ...rendered });
          return ctx.json({ status: true });
        },
      ),

      /** Checks the code, then signs this browser in as the customer. */
      verifyImpersonationCode: createAuthEndpoint(
        IMPERSONATION_VERIFY_PATH,
        { method: "POST", body: verifyBody },
        async (ctx) => {
          const { adminEmail: admin, customerEmail: customer, code } = ctx.body;
          const identifier = identifierFor(admin);
          const adapter = ctx.context.internalAdapter;
          const existing = await adapter.findVerificationValue(identifier);
          const stored = existing == null ? null : parseStored(existing.value);
          if (existing == null || stored?.customerEmail !== customer)
            throw new APIError("BAD_REQUEST", {
              code: "OTP_NOT_FOUND",
              message: "Ask for a new code.",
            });
          if (existing.expiresAt < new Date()) {
            await adapter.deleteVerificationByIdentifier(identifier);
            throw new APIError("BAD_REQUEST", {
              code: "OTP_EXPIRED",
              message: "This code has expired. Ask for a new one.",
            });
          }
          if (stored.attempts >= IMPERSONATION_ALLOWED_ATTEMPTS) {
            await adapter.deleteVerificationByIdentifier(identifier);
            throw new APIError("FORBIDDEN", {
              code: "TOO_MANY_ATTEMPTS",
              message: "Too many wrong codes. Ask for a new one.",
            });
          }
          if (
            !constantTimeEqual(hashCode(ctx.context.secret, code), stored.hash)
          ) {
            await adapter.updateVerificationByIdentifier(identifier, {
              value: JSON.stringify({
                ...stored,
                attempts: stored.attempts + 1,
              } satisfies StoredCode),
            });
            throw new APIError("BAD_REQUEST", {
              code: "INVALID_OTP",
              message: "That code is incorrect. Please try again.",
            });
          }
          await adapter.deleteVerificationByIdentifier(identifier);

          const found = await adapter.findUserByEmail(customer);
          if (found == null)
            throw new APIError("NOT_FOUND", {
              code: "IMPERSONATION_USER_NOT_FOUND",
              message: "No User has this email.",
            });
          const session = await adapter.createSession(
            found.user.id,
            false,
            { impersonatedBy: admin },
            true,
          );
          await prisma.identityImpersonation.create({
            data: {
              id: randomUUID(),
              adminEmail: admin,
              userId: found.user.id,
              customerEmail: customer,
              sessionId: session.id,
              ipAddress: session.ipAddress ?? null,
              userAgent: session.userAgent ?? null,
            },
          });
          await setSessionCookie(ctx, { session, user: found.user });
          return ctx.json({ userId: found.user.id });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}
