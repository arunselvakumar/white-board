import { Prisma, prisma, type PrismaClient } from "@repo/construction-db";

import { deletePushSubscriptionsForSessions } from "@/src/messaging/infrastructure/prisma-push-stores";
import type { PushSessions } from "@/src/organization/application/device-handlers";
import type { AccountErasureHook } from "@/src/organization/infrastructure/prisma-account-deletion-store";

/**
 * Messaging's push subscriptions, notifications and preferences
 * (`construction_messaging`, CM-904) for Devices, sign-out and Delete My
 * Account (CM-907), so the organization context never imports messaging.
 */

type Db = Pick<
  PrismaClient,
  "$queryRaw" | "constructionMessagingPushSubscription"
>;

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
export function deletePushSubscriptionsOfSessions(
  sessionIds: readonly string[],
  db: Db = prisma,
): Promise<number> {
  return deletePushSubscriptionsForSessions(sessionIds, db);
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
  await tx.constructionMessagingPushSubscription.deleteMany({
    where: { userId },
  });
  await tx.constructionMessagingNotification.deleteMany({
    where: { recipientUserId: userId },
  });
  await tx.constructionMessagingNotificationPreference.deleteMany({
    where: { userId },
  });
};
