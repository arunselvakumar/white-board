import {
  constructionMessaging,
  isPlaceholderEmail,
  otpTestCode,
} from "@repo/auth/construction/server";
import { prisma, type PrismaClient } from "@repo/construction-db";
import { renderCompanyCodeEmail } from "@repo/email-templates";

import {
  ACTION_CODE_LABELS,
  ACTION_CODE_TTL_MS,
  REVEAL_WINDOW_MS,
  actionCodeLocked,
  actionCodeWrong,
  assertCanResend,
  assertTryable,
  codeMatches,
  hashActionCode,
  maskDestination,
  newActionCode,
  ACTION_CODE_MAX_ATTEMPTS,
  type ActionCodePurpose,
  type ActionCodeRecord,
} from "./action-code-rules";
import { DomainError, conflict } from "./domain-error";
import { newId } from "./ids";

export {
  ACTION_CODE_PURPOSES,
  isActionCodePurpose,
  type ActionCodePurpose,
} from "./action-code-rules";

/**
 * Action codes (ADR CM-0021 §8, §10, §11): a six-digit code sent to the
 * signed-in User before a sensitive action, stored hashed in
 * `construction_organization.action_codes`.
 *
 * - `sendActionCode` sends a new code (by SMS while SMS is on and the User
 *   signs in by mobile, else to their sign-in email). One per purpose per
 *   minute (429 `ACTION_CODE_TOO_SOON`); a new code replaces the last.
 * - `verifyActionCode` checks it: 10 minutes, five tries, once. Refusals
 *   are 400 `ACTION_CODE_NOT_FOUND` / `ACTION_CODE_EXPIRED` /
 *   `ACTION_CODE_INVALID` (with `attemptsLeft`) and 429
 *   `ACTION_CODE_LOCKED`. A code sent for a Company works only in it.
 * - `reveal_identifiers` is the exception to "once": verifying it opens a
 *   10-minute window for that session, which `hasRevealWindow` reads.
 *
 * Callers: the action-code route (any purpose), Transfer ownership,
 * Delete My Account, Delete Company, reveals, and the full Company
 * backup (CM-906, purpose `company_backup`).
 */

/** Who the code is for: the signed-in User, from their Session. */
export type ActionCodeUser = {
  id: string;
  email: string;
  /** Verified E.164 mobile, when they sign in by mobile. */
  phoneNumber: string | null;
};

export type SendActionCodeInput = {
  user: ActionCodeUser;
  purpose: ActionCodePurpose;
  /** The Active Company, for Company actions; null for account actions. */
  workspaceId?: string | null;
  /** The Session; required for `reveal_identifiers`. */
  sessionId?: string | null;
};

export type SentActionCode = {
  channel: "email" | "sms";
  /** Masked: "a•••@anugraha.in", "•••••5767". */
  sentTo: string;
  expiresAt: Date;
};

export type VerifyActionCodeInput = {
  userId: string;
  purpose: ActionCodePurpose;
  code: string;
  /** Must match the Company the code was sent for, when it was. */
  workspaceId?: string | null;
  sessionId?: string | null;
};

type Senders = {
  email(input: {
    to: string;
    code: string;
    purpose: ActionCodePurpose;
  }): Promise<void>;
  sms(input: {
    to: string;
    code: string;
    purpose: ActionCodePurpose;
  }): Promise<void>;
  smsEnabled(): boolean;
};

const defaultSenders: Senders = {
  async email({ to, code, purpose }) {
    const rendered = await renderCompanyCodeEmail({
      code,
      purpose: "confirm-action",
      action: ACTION_CODE_LABELS[purpose],
      expiresInMinutes: ACTION_CODE_TTL_MS / 60_000,
    });
    await constructionMessaging.sendEmail({ to, ...rendered });
  },
  async sms({ to, code, purpose }) {
    await constructionMessaging.sendSms({
      to,
      code,
      text: `${code} is your Construction Management code to ${ACTION_CODE_LABELS[purpose]}. It expires in 10 minutes. Do not share it.`,
    });
  },
  smsEnabled: () => constructionMessaging.smsEnabled,
};

function secret(): string {
  const value = process.env["BETTER_AUTH_SECRET"];
  if (value != null && value.length > 0) return value;
  if (process.env.NODE_ENV === "production")
    throw new Error("BETTER_AUTH_SECRET is required in production.");
  return "construction-development-action-code-secret";
}

type Row = Awaited<
  ReturnType<PrismaClient["constructionOrganizationActionCode"]["findFirst"]>
>;

function toRecord(row: NonNullable<Row>): ActionCodeRecord {
  return {
    id: row.id,
    userId: row.userId,
    workspaceId: row.workspaceId,
    sessionId: row.sessionId,
    purpose: row.purpose,
    codeHash: row.codeHash,
    attempts: row.attempts,
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt,
    createdAt: row.createdAt,
  };
}

export class ActionCodes {
  constructor(
    private readonly db: PrismaClient = prisma,
    private readonly senders: Senders = defaultSenders,
    private readonly clock: () => Date = () => new Date(),
    private readonly testCode: () => string | null = otpTestCode,
  ) {}

  private channelFor(user: ActionCodeUser): {
    channel: "email" | "sms";
    to: string;
  } {
    if (this.senders.smsEnabled() && user.phoneNumber != null)
      return { channel: "sms", to: user.phoneNumber };
    if (isPlaceholderEmail(user.email))
      throw conflict(
        "ACTION_CODE_NO_CHANNEL",
        "We cannot send you a code: your account has no email, and text messages are off.",
      );
    return { channel: "email", to: user.email };
  }

  async send(input: SendActionCodeInput): Promise<SentActionCode> {
    const now = this.clock();
    if (input.purpose === "reveal_identifiers" && input.sessionId == null)
      throw new Error("A reveal code needs the Session it opens reveals for.");
    const destination = this.channelFor(input.user);
    const last = await this.db.constructionOrganizationActionCode.findFirst({
      where: { userId: input.user.id, purpose: input.purpose },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    assertCanResend(last, now);
    const id = newId(now.getTime());
    const code = newActionCode();
    const expiresAt = new Date(now.getTime() + ACTION_CODE_TTL_MS);
    await this.db.$transaction([
      // A new code replaces any earlier one for the same purpose.
      this.db.constructionOrganizationActionCode.updateMany({
        where: {
          userId: input.user.id,
          purpose: input.purpose,
          consumedAt: null,
        },
        data: { consumedAt: now },
      }),
      this.db.constructionOrganizationActionCode.create({
        data: {
          id,
          userId: input.user.id,
          workspaceId: input.workspaceId ?? null,
          sessionId: input.sessionId ?? null,
          purpose: input.purpose,
          codeHash: hashActionCode(secret(), {
            id,
            userId: input.user.id,
            purpose: input.purpose,
            code,
          }),
          expiresAt,
          createdAt: now,
        },
      }),
    ]);
    const message = { to: destination.to, code, purpose: input.purpose };
    if (destination.channel === "sms") await this.senders.sms(message);
    else await this.senders.email(message);
    return {
      channel: destination.channel,
      sentTo: maskDestination(destination.channel, destination.to),
      expiresAt,
    };
  }

  /** Checks and uses the User's latest code for the purpose; throws a refusal. */
  async verify(input: VerifyActionCodeInput): Promise<void> {
    const now = this.clock();
    const row = await this.db.constructionOrganizationActionCode.findFirst({
      where: {
        userId: input.userId,
        purpose: input.purpose,
        consumedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });
    const record = row == null ? null : toRecord(row);
    assertTryable(record, now);
    if (
      (record.workspaceId != null &&
        record.workspaceId !== (input.workspaceId ?? null)) ||
      (record.sessionId != null &&
        input.sessionId != null &&
        record.sessionId !== input.sessionId)
    )
      throw new DomainError(
        "ACTION_CODE_NOT_FOUND",
        "This code was sent for another Company or device. Ask for a new one.",
      );
    if (!codeMatches(secret(), record, input.code, this.testCode())) {
      // Counted atomically, so parallel guesses cannot exceed the limit.
      const counted =
        await this.db.constructionOrganizationActionCode.updateManyAndReturn({
          where: {
            id: record.id,
            consumedAt: null,
            attempts: { lt: ACTION_CODE_MAX_ATTEMPTS },
          },
          data: { attempts: { increment: 1 } },
          select: { attempts: true },
        });
      const attempts = counted[0]?.attempts;
      if (attempts == null) throw actionCodeLocked();
      throw actionCodeWrong(Math.max(ACTION_CODE_MAX_ATTEMPTS - attempts, 0));
    }
    const used = await this.db.constructionOrganizationActionCode.updateMany({
      where: { id: record.id, consumedAt: null },
      data: {
        consumedAt: now,
        verifiedUntil:
          input.purpose === "reveal_identifiers"
            ? new Date(now.getTime() + REVEAL_WINDOW_MS)
            : null,
      },
    });
    if (used.count !== 1) throw actionCodeWrong(0);
  }

  /** Whether a verified reveal code covers this session right now. */
  async hasRevealWindow(input: {
    userId: string;
    sessionId: string;
  }): Promise<boolean> {
    const found = await this.db.constructionOrganizationActionCode.count({
      where: {
        userId: input.userId,
        sessionId: input.sessionId,
        purpose: "reveal_identifiers",
        verifiedUntil: { gt: this.clock() },
      },
    });
    return found > 0;
  }
}

const shared = new ActionCodes();

/** Sends a new code for the purpose to the signed-in User. */
export function sendActionCode(
  input: SendActionCodeInput,
): Promise<SentActionCode> {
  return shared.send(input);
}

/** Checks and uses the code; throws the refusal (see the module comment). */
export function verifyActionCode(input: VerifyActionCodeInput): Promise<void> {
  return shared.verify(input);
}

/**
 * 409 `REVEAL_CODE_REQUIRED` unless a `reveal_identifiers` code was
 * verified in this session in the last 10 minutes (CM-0021 §11).
 */
export async function assertRevealAllowed(input: {
  userId: string;
  sessionId: string;
}): Promise<void> {
  if (await shared.hasRevealWindow(input)) return;
  throw conflict(
    "REVEAL_CODE_REQUIRED",
    "Enter the code we send you to see full Aadhaar and PAN numbers.",
  );
}
