import type { QueueHandler } from "@/src/shared-kernel/queue";

import { notificationGroup, pushPayload } from "../domain/notification";
import type {
  DeliveryLog,
  NotificationStore,
  PreferenceStore,
  PushSender,
  PushSubscriptionStore,
} from "./ports";

/** The queue type of one notification's push (ADR CM-0021 §6). */
export const PUSH_QUEUE_TYPE = "push";

type PushJobPayload = { notificationId: string };

export function pushJobPayload(notificationId: string): PushJobPayload {
  return { notificationId };
}

function payloadOf(value: unknown): PushJobPayload {
  const payload = value as Partial<PushJobPayload> | null;
  if (typeof payload?.notificationId !== "string")
    throw new Error("A push job needs a notificationId.");
  return { notificationId: payload.notificationId };
}

export type PushDeliveryDeps = {
  store: NotificationStore;
  subscriptions: PushSubscriptionStore;
  preferences: PreferenceStore;
  sender: PushSender;
  clock?: () => Date;
};

/**
 * Sends one notification to each of its recipient's browsers and logs
 * every attempt in `notification_deliveries`:
 * - skipped when push is not set up (no VAPID keys), the group is muted,
 *   or no device has notifications on;
 * - a 404/410 from the push service deletes that subscription (failed);
 * - other errors are logged as failed and not retried, so a device that
 *   did get it is not sent it twice.
 */
export async function deliverPush(
  deps: PushDeliveryDeps,
  notificationId: string,
): Promise<DeliveryLog[]> {
  const now = (deps.clock ?? (() => new Date()))();
  const notification = await deps.store.find(notificationId);
  if (notification == null || notification.deletedAt != null) return [];
  const base = {
    notificationId: notification.id,
    workspaceId: notification.workspaceId,
    recipientUserId: notification.recipientUserId,
    channel: "web_push" as const,
  };
  const skipped = async (error: string) => {
    const logs = [{ ...base, status: "skipped" as const, error }];
    await deps.store.logDeliveries(logs, now);
    return logs;
  };
  if (!deps.sender.configured)
    return skipped("Push is not set up on this server.");
  if (notification.readAt != null) return skipped("Already read in the app.");
  const muted = await deps.preferences.mutedGroups(
    notification.recipientUserId,
  );
  if (muted.includes(notificationGroup(notification.menu)))
    return skipped("Push is muted for this group.");
  const subscriptions = await deps.subscriptions.ofUser(
    notification.recipientUserId,
  );
  if (subscriptions.length === 0)
    return skipped("No device has notifications turned on.");

  const payload = pushPayload(notification);
  const logs: DeliveryLog[] = [];
  const gone: string[] = [];
  const sent: string[] = [];
  for (const subscription of subscriptions) {
    const result = await deps.sender.send(subscription, payload);
    if (result.ok) {
      sent.push(subscription.id);
      logs.push({
        ...base,
        status: "sent",
        pushSubscriptionId: subscription.id,
      });
      continue;
    }
    if (result.gone) gone.push(subscription.id);
    logs.push({
      ...base,
      status: "failed",
      pushSubscriptionId: subscription.id,
      error: result.error,
    });
  }
  await deps.store.logDeliveries(logs, now);
  if (gone.length > 0) await deps.subscriptions.deleteIds(gone);
  if (sent.length > 0) await deps.subscriptions.touch(sent, now);
  return logs;
}

/** The `push` queue handler: one job per notification. */
export function pushQueueHandler(deps: PushDeliveryDeps): QueueHandler {
  return {
    type: PUSH_QUEUE_TYPE,
    timeLimitMs: 30_000,
    async run(job) {
      await deliverPush(deps, payloadOf(job.payload).notificationId);
    },
  };
}
