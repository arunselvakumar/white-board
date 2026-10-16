import { describe, expect, it } from "vitest";

import type {
  DeliveryLog,
  NotificationRecord,
  NotificationStore,
  PreferenceStore,
  PushSender,
  PushSendResult,
  PushSubscriptionRecord,
  PushSubscriptionStore,
} from "./ports";
import {
  deliverPush,
  PUSH_DRAIN_BUDGET_MS,
  PUSH_TIME_LIMIT_MS,
} from "./push-delivery";

const NOTIFICATION: NotificationRecord = {
  id: "n-1",
  workspaceId: "ws",
  recipientUserId: "user-1",
  menu: "procurement.purchase_requests",
  projectId: null,
  type: "approval.requested",
  title: "Purchase Request PR-0001 is waiting for your approval",
  body: "Tower A",
  href: "/app/projects/p/materials/purchase-requests/pr",
  attachment: null,
  readAt: null,
  deletedAt: null,
  createdAt: new Date(),
};

function subscription(id: string): PushSubscriptionRecord {
  return {
    id,
    userId: "user-1",
    endpoint: `https://fcm.googleapis.com/fcm/send/${id}`,
    p256dh: "k",
    auth: "a",
  };
}

function setup(options: {
  notification?: Partial<NotificationRecord> | null;
  muted?: readonly string[];
  subscriptions?: readonly PushSubscriptionRecord[];
  results?: Record<string, PushSendResult>;
  configured?: boolean;
}) {
  const logs: DeliveryLog[] = [];
  const deleted: string[] = [];
  const touched: string[] = [];
  const sentTo: string[] = [];
  const store = {
    find: () =>
      Promise.resolve(
        options.notification === null
          ? null
          : { ...NOTIFICATION, ...options.notification },
      ),
    logDeliveries: (rows: readonly DeliveryLog[]) => {
      logs.push(...rows);
      return Promise.resolve();
    },
  } as Partial<NotificationStore> as NotificationStore;
  const subscriptions = {
    ofUser: () => Promise.resolve([...(options.subscriptions ?? [])]),
    deleteIds: (ids: readonly string[]) => {
      deleted.push(...ids);
      return Promise.resolve();
    },
    touch: (ids: readonly string[]) => {
      touched.push(...ids);
      return Promise.resolve();
    },
  } as Partial<PushSubscriptionStore> as PushSubscriptionStore;
  const preferences: PreferenceStore = {
    mutedGroups: () => Promise.resolve([...(options.muted ?? [])]),
    save: () => Promise.resolve(),
  };
  const sender: PushSender = {
    configured: options.configured ?? true,
    send(target, payload) {
      sentTo.push(target.id);
      expect(payload).toEqual({
        title: NOTIFICATION.title,
        body: NOTIFICATION.body,
        href: NOTIFICATION.href,
        tag: NOTIFICATION.id,
      });
      return Promise.resolve(options.results?.[target.id] ?? { ok: true });
    },
  };
  return {
    run: () =>
      deliverPush({ store, subscriptions, preferences, sender }, "n-1"),
    logs,
    deleted,
    touched,
    sentTo,
  };
}

describe("push delivery (CM-904)", () => {
  it("sends to each device and logs each attempt; a gone device is deleted", async () => {
    const ctx = setup({
      subscriptions: [subscription("a"), subscription("b"), subscription("c")],
      results: {
        b: { ok: false, gone: true, error: "410: Gone" },
        c: { ok: false, gone: false, error: "500: Busy" },
      },
    });
    await ctx.run();
    expect(ctx.sentTo).toEqual(["a", "b", "c"]);
    expect(
      ctx.logs.map((log) => [log.pushSubscriptionId, log.status, log.error]),
    ).toEqual([
      ["a", "sent", undefined],
      ["b", "failed", "410: Gone"],
      ["c", "failed", "500: Busy"],
    ]);
    expect(ctx.deleted).toEqual(["b"]);
    expect(ctx.touched).toEqual(["a"]);
  });

  it("skips and logs when push is not set up, the group is muted, or no device is on", async () => {
    for (const [options, reason] of [
      [{ configured: false }, "Push is not set up on this server."],
      [
        { muted: ["materials"], subscriptions: [subscription("a")] },
        "Push is muted for this group.",
      ],
      [{ subscriptions: [] }, "No device has notifications turned on."],
      [{ notification: { readAt: new Date() } }, "Already read in the app."],
    ] as const) {
      const ctx = setup(options);
      await ctx.run();
      expect(ctx.sentTo).toEqual([]);
      expect(ctx.logs).toEqual([
        expect.objectContaining({
          channel: "web_push",
          status: "skipped",
          error: reason,
        }),
      ]);
    }
  });

  it("does nothing for a notification deleted before its push ran", async () => {
    const ctx = setup({
      notification: { deletedAt: new Date() },
      subscriptions: [subscription("a")],
    });
    expect(await ctx.run()).toEqual([]);
    expect(ctx.logs).toEqual([]);
    const gone = setup({ notification: null });
    expect(await gone.run()).toEqual([]);
  });
});

describe("the push drain budget", () => {
  it("fits a push job, so the drain after a request claims it", () => {
    expect(PUSH_DRAIN_BUDGET_MS).toBeGreaterThan(PUSH_TIME_LIMIT_MS);
  });
});
