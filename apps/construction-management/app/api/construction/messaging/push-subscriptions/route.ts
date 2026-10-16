import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse, requireUserSession } from "@/app/api/_lib/require-session";

import { currentSessionId, notifications } from "../handlers";
import { CreateConstructionMessagingPushSubscriptionRequestModel } from "../messaging-models";

export const dynamic = "force-dynamic";

/**
 * "Turn on notifications on this device": stores the browser's web push
 * subscription for the signed-in User, tied to this session so signing
 * out of the device removes it. The same endpoint again updates it.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      CreateConstructionMessagingPushSubscriptionRequestModel.safeParse(
        await request.json(),
      ),
    );
    const session = await requireUserSession(request);
    if (isResponse(session)) return session;
    const saved = await notifications.subscribe({
      userId: session.userId,
      sessionId: await currentSessionId(request),
      endpoint: model.endpoint,
      p256dh: model.keys.p256dh,
      auth: model.keys.auth,
      userAgent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
    });
    return Response.json(saved, { status: StatusCodes.CREATED });
  } catch (error) {
    return mapError(error);
  }
}
