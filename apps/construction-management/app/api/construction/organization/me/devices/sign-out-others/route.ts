import { mapError } from "@/app/api/_lib/map-error";
import { isResponse, requireUserSession } from "@/app/api/_lib/require-session";
import { deviceHandlers } from "@/src/composition/account";

import type { SignOutConstructionOrganizationOtherDevicesResponseModel } from "../device-models";

export const dynamic = "force-dynamic";

/** Signs every other device out and deletes their push subscriptions. */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireUserSession(request);
    if (isResponse(session)) return session;
    const signedOut = await deviceHandlers.signOutOthers({
      userId: session.userId,
      currentSessionId: session.sessionId,
    });
    const body: SignOutConstructionOrganizationOtherDevicesResponseModel = {
      signedOut,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
