/**
 * The browser's push APIs behind one small seam, so My Profile →
 * Notifications can be shown in every state in Storybook (CM-904).
 */
import { base64UrlToBytes } from "@/lib/notification-format";

import type { PushSubscriptionInput } from "@/components/notifications/notification-queries";

export type PushPermission = "default" | "granted" | "denied";

export type PushDevice = {
  /** Service workers, the Push API and notifications all exist here. */
  isSupported: () => boolean;
  /** What the browser allows this site. */
  permission: () => PushPermission;
  /** This browser's push subscription, or null when it has none. */
  current: () => Promise<PushSubscriptionInput | null>;
  /** Asks for permission, registers `/sw.js` and subscribes. */
  subscribe: (publicKey: string) => Promise<PushSubscriptionInput>;
  /** Unsubscribes; returns the endpoint it had, or null. */
  unsubscribe: () => Promise<string | null>;
};

/** The browser said no (or the person closed the prompt). */
export class PushPermissionError extends Error {
  readonly permission: PushPermission;

  constructor(permission: PushPermission) {
    super(`Notification permission is ${permission}.`);
    this.name = "PushPermissionError";
    this.permission = permission;
  }
}

export const SERVICE_WORKER_URL = "/sw.js";

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

function subscriptionInput(
  subscription: PushSubscription,
): PushSubscriptionInput {
  const json = subscription.toJSON();
  const p256dh = json.keys?.["p256dh"];
  const auth = json.keys?.["auth"];
  if (json.endpoint == null || p256dh == null || auth == null)
    throw new Error("The browser returned an incomplete subscription.");
  return { endpoint: json.endpoint, keys: { p256dh, auth } };
}

/** The real browser. */
export const browserPushDevice: PushDevice = {
  isSupported: () =>
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window,
  permission: () => Notification.permission,
  current: async () => {
    const subscription = await currentSubscription();
    return subscription == null ? null : subscriptionInput(subscription);
  },
  subscribe: async (publicKey) => {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new PushPermissionError(permission);
    await navigator.serviceWorker.register(SERVICE_WORKER_URL);
    const registration = await navigator.serviceWorker.ready;
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(publicKey),
      }));
    return subscriptionInput(subscription);
  },
  unsubscribe: async () => {
    const subscription = await currentSubscription();
    if (subscription == null) return null;
    const { endpoint } = subscription;
    await subscription.unsubscribe();
    return endpoint;
  },
};
