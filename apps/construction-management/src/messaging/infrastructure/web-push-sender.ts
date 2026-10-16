import webPush from "web-push";

import type { PushSender } from "../application/ports";

export type VapidKeys = {
  publicKey: string;
  privateKey: string;
  /** `mailto:` or an https URL the push service can contact. */
  subject: string;
};

/**
 * The VAPID keys from `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and
 * `VAPID_SUBJECT` (generate them with `bunx web-push generate-vapid-keys`);
 * null when any is unset, and push is then skipped.
 */
export function vapidKeysFromEnv(
  env: Record<string, string | undefined> = process.env,
): VapidKeys | null {
  const publicKey = env["VAPID_PUBLIC_KEY"]?.trim() ?? "";
  const privateKey = env["VAPID_PRIVATE_KEY"]?.trim() ?? "";
  const subject = env["VAPID_SUBJECT"]?.trim() ?? "";
  if (publicKey === "" || privateKey === "" || subject === "") return null;
  return { publicKey, privateKey, subject };
}

function statusOf(error: unknown): number | null {
  const status = (error as { statusCode?: unknown } | null)?.statusCode;
  return typeof status === "number" ? status : null;
}

/** Web push with VAPID through the `web-push` package (ADR CM-0021 §6). */
export function webPushSender(keys: VapidKeys | null): PushSender {
  return {
    configured: keys != null,
    async send(subscription, payload) {
      if (keys == null)
        return { ok: false, gone: false, error: "Push is not set up." };
      try {
        await webPush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          JSON.stringify(payload),
          {
            vapidDetails: keys,
            // A day: a phone that is off longer gets the list, not a push.
            TTL: 24 * 60 * 60,
          },
        );
        return { ok: true };
      } catch (error) {
        const status = statusOf(error);
        const message = error instanceof Error ? error.message : String(error);
        return {
          ok: false,
          gone: status === 404 || status === 410,
          error:
            status == null
              ? message.slice(0, 500)
              : `${String(status)}: ${message}`.slice(0, 500),
        };
      }
    },
  };
}
