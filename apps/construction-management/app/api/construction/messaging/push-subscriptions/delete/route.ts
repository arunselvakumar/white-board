import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse, requireUserSession } from "@/app/api/_lib/require-session";

import { notifications } from "../../handlers";
import { DeleteConstructionMessagingPushSubscriptionRequestModel } from "../../messaging-models";

export const dynamic = "force-dynamic";

/** Turns notifications off on this device: removes the User's subscription. */
export async function POST(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      DeleteConstructionMessagingPushSubscriptionRequestModel.safeParse(
        await request.json(),
      ),
    );
    const session = await requireUserSession(request);
    if (isResponse(session)) return session;
    await notifications.unsubscribe(session.userId, model.endpoint);
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
