import { Prisma, prisma, type PrismaClient } from "@repo/construction-db";

import type { PushSessions } from "@/src/organization/application/device-handlers";
import type { AccountErasureHook } from "@/src/organization/infrastructure/prisma-account-deletion-store";

/**
 * Plain reads and deletes on messaging's tables (`construction_messaging`,
 * CM-904) for Devices, sign-out and Delete My Account (CM-907), so the
 * organization context never imports messaging.
 */

type Db = Pick<PrismaClient, "$queryRaw" | "$executeRaw">;

/** The sessions among `sessionIds` with a push subscription. */
export async function sessionsWithPush(
  sessionIds: readonly string[],
  db: Db = prisma,
): Promise<Set<string>> {
  if (sessionIds.length === 0) return new Set();
  const rows = await db.$queryRaw<{ sessionId: string }[]>(Prisma.sql`
    SELECT DISTINCT session_id AS "sessionId"
    FROM construction_messaging.push_subscriptions
    WHERE session_id = ANY(${[...sessionIds]}::text[])
  `);
  return new Set(rows.map((row) => row.sessionId));
}

/** Deletes the push subscriptions of these sessions (signed out). */
export async function deletePushSubscriptionsOfSessions(
  sessionIds: readonly string[],
  db: Db = prisma,
): Promise<number> {
  if (sessionIds.length === 0) return 0;
  return db.$executeRaw(Prisma.sql`
    DELETE FROM construction_messaging.push_subscriptions
    WHERE session_id = ANY(${[...sessionIds]}::text[])
  `);
}

/** Devices' view of push (organization's `PushSessions` port). */
export function pushSessions(db: Db = prisma): PushSessions {
  return {
    withPush: (sessionIds) => sessionsWithPush(sessionIds, db),
    forget: async (sessionIds) => {
      await deletePushSubscriptionsOfSessions(sessionIds, db);
    },
  };
}

/**
 * Delete My Account's messaging clean-up, inside its transaction: the
 * User's push subscriptions, notifications and preferences. Delivery logs
 * stay (kept a year for audit, ADR CM-0021 §3).
 */
export const deleteMessagingOfUser: AccountErasureHook = async (tx, userId) => {
  await tx.$executeRaw(Prisma.sql`
    DELETE FROM construction_messaging.push_subscriptions
    WHERE user_id = ${userId}
  `);
  await tx.$executeRaw(Prisma.sql`
    DELETE FROM construction_messaging.notifications
    WHERE recipient_user_id = ${userId}
  `);
  await tx.$executeRaw(Prisma.sql`
    DELETE FROM construction_messaging.notification_preferences
    WHERE user_id = ${userId}
  `);
};
