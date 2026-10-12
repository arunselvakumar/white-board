import { mapError } from "@/app/api/_lib/map-error";
import { createNotificationHandlers } from "@/src/training-institute/infrastructure/create-absence-notice-handlers";

import type { TrainingInstituteUnreadNotificationsResponseModel } from "../notification-models";
import { requireNotificationRecipient } from "../notification-session";

export const dynamic = "force-dynamic";

const handlers = createNotificationHandlers();

/** The bell's count of unread Notifications. */
export async function GET(): Promise<Response> {
  try {
    const recipient = await requireNotificationRecipient();
    if (recipient instanceof Response) return recipient;
    const body: TrainingInstituteUnreadNotificationsResponseModel =
      await handlers.unreadCount(recipient);
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
