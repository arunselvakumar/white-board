import {
  constructionAuthRouteHandlers,
  getCompanyAuthFromHeaders,
} from "@repo/auth/construction/server";

import { deletePushSubscriptionsOfSessions } from "@/src/composition/push-subscriptions";

export const { GET } = constructionAuthRouteHandlers;

/**
 * Better Auth's routes. Signing out also deletes that session's web push
 * subscriptions (CM-907), so a signed-out browser stops getting
 * notifications.
 */
export async function POST(request: Request): Promise<Response> {
  if (!new URL(request.url).pathname.endsWith("/sign-out"))
    return constructionAuthRouteHandlers.POST(request);
  const { sessionId } = await getCompanyAuthFromHeaders(request.headers);
  const response = await constructionAuthRouteHandlers.POST(request);
  if (response.ok && sessionId != null)
    try {
      await deletePushSubscriptionsOfSessions([sessionId]);
    } catch (error) {
      console.error("Sign-out could not delete push subscriptions", error);
    }
  return response;
}
