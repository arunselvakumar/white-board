import { prisma, type PrismaClient } from "@repo/construction-db";

import { newId } from "@/src/shared-kernel/ids";

import type {
  PreferenceStore,
  PushSubscriptionStore,
} from "../application/ports";

/** `construction_messaging.push_subscriptions` (CM-904). */
export function prismaPushSubscriptionStore(
  db: PrismaClient,
): PushSubscriptionStore {
  const subscriptions = db.constructionMessagingPushSubscription;
  return {
    async save(input, now) {
      // One row per endpoint: a browser that signs in as someone else
      // moves its subscription to them.
      const row = await subscriptions.upsert({
        where: { endpoint: input.endpoint },
        create: {
          id: newId(now.getTime()),
          userId: input.userId,
          sessionId: input.sessionId,
          endpoint: input.endpoint,
          p256dh: input.p256dh,
          auth: input.auth,
          userAgent: input.userAgent,
          createdAt: now,
        },
        update: {
          userId: input.userId,
          sessionId: input.sessionId,
          p256dh: input.p256dh,
          auth: input.auth,
          userAgent: input.userAgent,
        },
        select: { id: true },
      });
      return { id: row.id };
    },

    async remove(userId, endpoint) {
      await subscriptions.deleteMany({ where: { userId, endpoint } });
    },

    ofUser(userId) {
      return subscriptions.findMany({
        where: { userId },
        select: {
          id: true,
          userId: true,
          endpoint: true,
          p256dh: true,
          auth: true,
        },
        orderBy: { createdAt: "asc" },
      });
    },

    async deleteIds(ids) {
      if (ids.length === 0) return;
      await subscriptions.deleteMany({ where: { id: { in: [...ids] } } });
    },

    async touch(ids, at) {
      if (ids.length === 0) return;
      await subscriptions.updateMany({
        where: { id: { in: [...ids] } },
        data: { lastUsedAt: at },
      });
    },
  };
}

/** `construction_messaging.notification_preferences` (CM-904). */
export function prismaPreferenceStore(db: PrismaClient): PreferenceStore {
  const preferences = db.constructionMessagingNotificationPreference;
  return {
    async mutedGroups(userId) {
      const row = await preferences.findUnique({
        where: { userId },
        select: { mutedGroups: true },
      });
      return row?.mutedGroups ?? [];
    },
    async save(userId, mutedGroups, now) {
      await preferences.upsert({
        where: { userId },
        create: { userId, mutedGroups: [...mutedGroups], updatedAt: now },
        update: { mutedGroups: [...mutedGroups], updatedAt: now },
      });
    },
  };
}

/**
 * Deletes the push subscriptions of these Better Auth sessions: signing
 * out of a device, or removing it, stops its notifications (ADR CM-0021
 * §6, §9). Devices (CM-907) calls this after revoking sessions.
 */
export async function deletePushSubscriptionsForSessions(
  sessionIds: readonly string[],
  db: Pick<PrismaClient, "constructionMessagingPushSubscription"> = prisma,
): Promise<number> {
  if (sessionIds.length === 0) return 0;
  const { count } = await db.constructionMessagingPushSubscription.deleteMany({
    where: { sessionId: { in: [...sessionIds] } },
  });
  return count;
}
