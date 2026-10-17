import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";

import { notifications } from "../handlers";
import {
  ListConstructionMessagingNotificationsRequestModel,
  toNotificationResponse,
  type ListConstructionMessagingNotificationsResponseModel,
} from "../messaging-models";

export const dynamic = "force-dynamic";

/**
 * The member's notifications in the Active Company, newest first, a page
 * at a time (`cursor`). Every member may read their own; deleted ones are
 * left out.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireCompanySession(request);
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ListConstructionMessagingNotificationsRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const page = await notifications.list(session, {
      cursor: model.cursor ?? null,
      limit: model.limit,
    });
    const body: ListConstructionMessagingNotificationsResponseModel = {
      items: page.items.map(toNotificationResponse),
      nextCursor: page.nextCursor,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
