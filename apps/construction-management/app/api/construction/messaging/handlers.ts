import { getCompanyAuthFromHeaders } from "@repo/auth/construction/server";

import { createNotificationHandlers } from "@/src/composition/messaging";
import { vapidKeysFromEnv } from "@/src/messaging/infrastructure/web-push-sender";

/** The member's notifications, preferences and push subscriptions (CM-904). */
export const notifications = createNotificationHandlers();

/** The VAPID public key the browser subscribes with; null when unset. */
export function pushPublicKey(): string | null {
  return vapidKeysFromEnv()?.publicKey ?? null;
}

/**
 * The Better Auth session id of the request, so a subscription is removed
 * when that device signs out (ADR CM-0021 §6, §9).
 */
export async function currentSessionId(
  request: Request,
): Promise<string | null> {
  const state = await getCompanyAuthFromHeaders(request.headers);
  return state.isAuthenticated ? state.sessionId : null;
}
