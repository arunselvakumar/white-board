import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";

import { notifications } from "../../../handlers";
import { ConstructionMessagingNotificationParamsModel } from "../../../messaging-models";

export const dynamic = "force-dynamic";

/**
 * Deletes one of the member's notifications from their list (ADR CM-0021
 * §6); its delivery log stays. 404 `NOTIFICATION_NOT_FOUND` for someone
 * else's, another Company's or an already deleted one.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionMessagingNotificationParamsModel.safeParse(
        await context.params,
      ),
    );
    const session = await requireCompanySession(request);
    if (isResponse(session)) return session;
    await notifications.delete(session, id);
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
