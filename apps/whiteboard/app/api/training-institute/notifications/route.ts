import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { createNotificationHandlers } from "@/src/training-institute/infrastructure/create-absence-notice-handlers";

import {
  ListTrainingInstituteNotificationsRequestModel,
  type ListTrainingInstituteNotificationsResponseModel,
} from "./notification-models";
import { requireNotificationRecipient } from "./notification-session";

export const dynamic = "force-dynamic";

const handlers = createNotificationHandlers();

/** The session User's Notifications, newest first. */
export async function GET(request: Request): Promise<Response> {
  try {
    const recipient = await requireNotificationRecipient();
    if (recipient instanceof Response) return recipient;
    const url = new URL(request.url);
    const query = parseOrThrow(
      ListTrainingInstituteNotificationsRequestModel.safeParse({
        limit: url.searchParams.get("limit") ?? undefined,
        after: url.searchParams.get("after") ?? undefined,
        before: url.searchParams.get("before") ?? undefined,
      }),
    );
    const body: ListTrainingInstituteNotificationsResponseModel =
      await handlers.list(recipient, query);
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
