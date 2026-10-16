import { randomUUID } from "node:crypto";

import { outbox } from "@repo/auth/construction/testing";
import { Prisma, prisma } from "@repo/construction-db";

import { POST as authPost } from "@/app/api/auth/[...all]/route";
import { POST as requestCodeRoute } from "@/app/api/construction/organization/action-codes/route";

import { jsonRequest } from "./companies";
import { TEST_ORIGIN, TEST_PASSWORD } from "./sessions";

// Account helpers for CM-907 HTTP tests: more sessions for one User,
// action codes, and messaging rows written straight to their tables.

export const CHROME_ON_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36";
export const SAFARI_ON_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

function cookieOf(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
}

/** The session id behind a cookie header from the auth routes. */
export async function sessionIdOf(cookie: string): Promise<string> {
  const raw = /construction\.session_token=([^;]+)/.exec(cookie)?.[1] ?? "";
  const token = decodeURIComponent(raw).split(".")[0] ?? "";
  const session = await prisma.identitySession.findUniqueOrThrow({
    where: { token },
    select: { id: true },
  });
  return session.id;
}

/**
 * Signs an existing email User in again from another browser: a second
 * session. Its Active Company is set like the first session's.
 */
export async function signInAgain(
  email: string,
  userAgent = SAFARI_ON_MAC,
  activeCompanyId: string | null = null,
): Promise<{ cookie: string; sessionId: string }> {
  const response = await authPost(
    new Request(`${TEST_ORIGIN}/api/auth/sign-in/email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: TEST_ORIGIN,
        "user-agent": userAgent,
      },
      body: JSON.stringify({ email, password: TEST_PASSWORD }),
    }),
  );
  if (!response.ok)
    throw new Error(`Sign-in failed: ${String(response.status)}`);
  const cookie = cookieOf(response);
  const sessionId = await sessionIdOf(cookie);
  if (activeCompanyId != null)
    await prisma.identitySession.update({
      where: { id: sessionId },
      data: { activeOrganizationId: activeCompanyId },
    });
  return { cookie, sessionId };
}

/** Asks for a code by the route; returns the status. */
export async function requestCode(
  cookie: string,
  purpose: string,
): Promise<Response> {
  return requestCodeRoute(
    jsonRequest(
      `${TEST_ORIGIN}/api/construction/organization/action-codes`,
      cookie,
      {
        purpose,
      },
    ),
  );
}

/** The newest code emailed to `email`. */
export function lastCodeEmailedTo(email: string): string {
  const sent = outbox.filter((mail) => mail.to === email).at(-1);
  const code = sent?.text.match(/\b(\d{6})\b/)?.[1];
  if (code == null) throw new Error(`No code was emailed to ${email}.`);
  return code;
}

/**
 * Asks for a code (after letting the 60-second limit pass) and returns
 * the one emailed to the User.
 */
export async function codeFor(
  user: { cookie: string; userId: string; email: string },
  purpose: string,
): Promise<string> {
  await ageCodes(user.userId);
  const response = await requestCode(user.cookie, purpose);
  if (response.status !== 204)
    throw new Error(`Code request failed: ${String(response.status)}`);
  return lastCodeEmailedTo(user.email);
}

/** Lets the User ask for a new code at once (the 60-second limit passes). */
export async function ageCodes(userId: string, ms = 61_000): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE construction_organization.action_codes
    SET created_at = created_at - ${`${String(ms)} milliseconds`}::interval
    WHERE user_id = ${userId}
  `);
}

/** A web push subscription for a session, as messaging (CM-904) stores it. */
export async function addPushSubscription(
  userId: string,
  sessionId: string | null,
): Promise<string> {
  const id = randomUUID();
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO construction_messaging.push_subscriptions
      (id, user_id, session_id, endpoint, p256dh, auth)
    VALUES (${id}::uuid, ${userId}, ${sessionId},
      ${`https://push.example.test/${id}`}, 'p256dh', 'auth')
  `);
  return id;
}

export async function pushSubscriptionCount(where: {
  userId?: string;
  sessionId?: string;
}): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
    SELECT count(*) AS count FROM construction_messaging.push_subscriptions
    WHERE (${where.userId ?? null}::text IS NULL OR user_id = ${where.userId ?? null})
      AND (${where.sessionId ?? null}::text IS NULL OR session_id = ${where.sessionId ?? null})
  `);
  return Number(rows[0]?.count ?? 0);
}

/** A notification and a muted-groups preference for the User. */
export async function addNotificationAndPreference(
  workspaceId: string,
  userId: string,
): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO construction_messaging.notifications
      (id, workspace_id, recipient_user_id, type, title)
    VALUES (${randomUUID()}::uuid, ${workspaceId}, ${userId}, 'task.assigned', 'A task for you')
  `);
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO construction_messaging.notification_preferences (user_id, muted_groups)
    VALUES (${userId}, ARRAY['procurement'])
    ON CONFLICT (user_id) DO NOTHING
  `);
}

export async function messagingCounts(userId: string): Promise<{
  push: number;
  notifications: number;
  preferences: number;
}> {
  const rows = await prisma.$queryRaw<
    { push: bigint; notifications: bigint; preferences: bigint }[]
  >(Prisma.sql`
    SELECT
      (SELECT count(*) FROM construction_messaging.push_subscriptions WHERE user_id = ${userId}) AS push,
      (SELECT count(*) FROM construction_messaging.notifications WHERE recipient_user_id = ${userId}) AS notifications,
      (SELECT count(*) FROM construction_messaging.notification_preferences WHERE user_id = ${userId}) AS preferences
  `);
  const row = rows[0];
  return {
    push: Number(row?.push ?? 0),
    notifications: Number(row?.notifications ?? 0),
    preferences: Number(row?.preferences ?? 0),
  };
}

/**
 * A verified `reveal_identifiers` code for the session, as if the User had
 * entered it: reveals are open for 10 minutes (ADR CM-0021 §11). Mocked
 * sessions (`actAs`) are `session_<userId>`.
 */
export async function openRevealWindow(
  userId: string,
  sessionId = `session_${userId}`,
): Promise<void> {
  const now = new Date();
  await prisma.constructionOrganizationActionCode.create({
    data: {
      id: randomUUID(),
      userId,
      sessionId,
      purpose: "reveal_identifiers",
      codeHash: "verified-in-test",
      expiresAt: new Date(now.getTime() + 600_000),
      consumedAt: now,
      verifiedUntil: new Date(now.getTime() + 600_000),
    },
  });
}
