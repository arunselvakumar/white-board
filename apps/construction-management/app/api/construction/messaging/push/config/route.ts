import { mapError } from "@/app/api/_lib/map-error";
import { isResponse, requireUserSession } from "@/app/api/_lib/require-session";

import { pushPublicKey } from "../../handlers";
import type { ConstructionMessagingPushConfigResponseModel } from "../../messaging-models";

export const dynamic = "force-dynamic";

/** The VAPID public key a browser subscribes with; null when push is not set up. */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireUserSession(request);
    if (isResponse(session)) return session;
    const body: ConstructionMessagingPushConfigResponseModel = {
      publicKey: pushPublicKey(),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
