import { mapError } from "@/app/api/_lib/map-error";
import { isResponse, requireUserSession } from "@/app/api/_lib/require-session";

import { notifications } from "../handlers";
import { toPreferencesResponse } from "../messaging-models";

export const dynamic = "force-dynamic";

/** My Profile → Notifications: one push switch per menu group. */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireUserSession(request);
    if (isResponse(session)) return session;
    return Response.json(
      toPreferencesResponse(await notifications.preferences(session.userId)),
    );
  } catch (error) {
    return mapError(error);
  }
}
