import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse, requireUserSession } from "@/app/api/_lib/require-session";

import { notifications } from "../../handlers";
import {
  toPreferencesResponse,
  UpdateConstructionMessagingPreferencesRequestModel,
} from "../../messaging-models";

export const dynamic = "force-dynamic";

/**
 * Mutes or unmutes push for one menu group; the other groups stay as they
 * are, so a tab opened before a group was added (or a mute copied by a
 * migration) cannot drop it. In-app notifications are not mutable: the
 * Notification flag decides them. 400 `UNKNOWN_NOTIFICATION_GROUP` for a
 * group that does not exist.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireUserSession(request);
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      UpdateConstructionMessagingPreferencesRequestModel.safeParse(
        await request.json(),
      ),
    );
    return Response.json(
      toPreferencesResponse(
        await notifications.setGroupMuted(
          session.userId,
          model.group,
          model.muted,
        ),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
