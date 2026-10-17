import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";

import { notifications } from "../../../handlers";
import {
  ConstructionMessagingNotificationParamsModel,
  toNotificationResponse,
} from "../../../messaging-models";

export const dynamic = "force-dynamic";

/**
 * Marks one of the member's notifications read (again is a no-op). 404
 * `NOTIFICATION_NOT_FOUND` for someone else's, another Company's or a
 * deleted one.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireCompanySession(request);
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionMessagingNotificationParamsModel.safeParse(
        await context.params,
      ),
    );
    return Response.json(
      toNotificationResponse(await notifications.markRead(session, id)),
    );
  } catch (error) {
    return mapError(error);
  }
}
