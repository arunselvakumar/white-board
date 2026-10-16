import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

import { DomainError } from "./domain-error";

/**
 * Six-digit codes sent to a User before a sensitive action (ADR CM-0021
 * §8, §10, §11). Pure rules; `action-codes.ts` stores and sends them.
 */
export const ACTION_CODE_PURPOSES = [
  "company_backup",
  "transfer_ownership",
  "delete_account",
  "delete_company",
  "reveal_identifiers",
] as const;

export type ActionCodePurpose = (typeof ACTION_CODE_PURPOSES)[number];

export const ACTION_CODE_LENGTH = 6;
/** A code works for 10 minutes. */
export const ACTION_CODE_TTL_MS = 10 * 60 * 1000;
/** At most one code per purpose per User every 60 seconds. */
export const ACTION_CODE_RESEND_MS = 60 * 1000;
/** Wrong tries before the code stops working. */
export const ACTION_CODE_MAX_ATTEMPTS = 5;
/** A verified `reveal_identifiers` code allows reveals for 10 minutes in its session. */
export const REVEAL_WINDOW_MS = 10 * 60 * 1000;

/** What the email and SMS say the code is for: "Enter this code to …". */
export const ACTION_CODE_LABELS: Record<ActionCodePurpose, string> = {
  company_backup: "download a full backup of your Company",
  transfer_ownership: "transfer ownership of your Company",
  delete_account: "delete your account",
  delete_company: "delete your Company",
  reveal_identifiers: "see full Aadhaar and PAN numbers",
};

export function isActionCodePurpose(value: string): value is ActionCodePurpose {
  return (ACTION_CODE_PURPOSES as readonly string[]).includes(value);
}

/** A fresh code, uniformly random, with leading zeros kept. */
export function newActionCode(): string {
  return String(randomInt(0, 10 ** ACTION_CODE_LENGTH)).padStart(
    ACTION_CODE_LENGTH,
    "0",
  );
}

/**
 * The stored form of a code: HMAC-SHA-256 keyed with the auth secret over
 * the row id, the User and the purpose, so a hash is useless for any other
 * row and a leaked table reveals no code.
 */
export function hashActionCode(
  secret: string,
  input: {
    id: string;
    userId: string;
    purpose: ActionCodePurpose;
    code: string;
  },
): string {
  return createHmac("sha256", secret)
    .update(`${input.id}:${input.userId}:${input.purpose}:${input.code}`)
    .digest("hex");
}

function sameHash(left: string, right: string): boolean {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** A stored code as the rules see it. */
export type ActionCodeRecord = {
  id: string;
  userId: string;
  workspaceId: string | null;
  sessionId: string | null;
  purpose: ActionCodePurpose;
  codeHash: string;
  attempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
};

/** 429 `ACTION_CODE_TOO_SOON` while the last code is under a minute old. */
export function assertCanResend(
  last: { createdAt: Date } | null,
  now: Date,
): void {
  if (last == null) return;
  const waitMs =
    last.createdAt.getTime() + ACTION_CODE_RESEND_MS - now.getTime();
  if (waitMs > 0)
    throw new DomainError(
      "ACTION_CODE_TOO_SOON",
      "We just sent you a code. Wait a minute before asking for another.",
      {
        kind: "too_many",
        details: { retryAfterSeconds: Math.ceil(waitMs / 1000) },
      },
    );
}

export function actionCodeNotFound(): DomainError {
  return new DomainError(
    "ACTION_CODE_NOT_FOUND",
    "Ask for a code first, or ask for a new one.",
  );
}

export function actionCodeExpired(): DomainError {
  return new DomainError(
    "ACTION_CODE_EXPIRED",
    "This code has expired. Ask for a new one.",
  );
}

export function actionCodeLocked(): DomainError {
  return new DomainError(
    "ACTION_CODE_LOCKED",
    "Too many wrong codes. Ask for a new one.",
    { kind: "too_many" },
  );
}

export function actionCodeWrong(attemptsLeft: number): DomainError {
  return new DomainError(
    "ACTION_CODE_INVALID",
    "That code is not right. Check it and try again.",
    { details: { attemptsLeft } },
  );
}

/**
 * Whether a code may still be tried: not used, not expired, not locked.
 * Throws the refusal otherwise.
 */
export function assertTryable(
  record: ActionCodeRecord | null,
  now: Date,
): asserts record is ActionCodeRecord {
  if (record == null || record.consumedAt != null) throw actionCodeNotFound();
  if (record.expiresAt.getTime() <= now.getTime()) throw actionCodeExpired();
  if (record.attempts >= ACTION_CODE_MAX_ATTEMPTS) throw actionCodeLocked();
}

/**
 * Whether `code` is the record's code. `testCode` is the development and
 * test bypass (`OTP_TEST_CODE`, never set in production): it stands in
 * for the real code of a live record, so expiry, attempts and single use
 * still apply.
 */
export function codeMatches(
  secret: string,
  record: ActionCodeRecord,
  code: string,
  testCode: string | null,
): boolean {
  const trimmed = code.trim();
  if (!/^\d{6}$/.test(trimmed)) return false;
  if (testCode != null && trimmed === testCode) return true;
  return sameHash(
    record.codeHash,
    hashActionCode(secret, {
      id: record.id,
      userId: record.userId,
      purpose: record.purpose,
      code: trimmed,
    }),
  );
}

/** "a•••@anugraha.in", "+91 ••••• •5767": where the code went, masked. */
export function maskDestination(
  channel: "email" | "sms",
  value: string,
): string {
  if (channel === "sms") return `•••••${value.slice(-4)}`;
  const [local = "", domain = ""] = value.split("@");
  return `${local.slice(0, 1)}•••@${domain}`;
}
