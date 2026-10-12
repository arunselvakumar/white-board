import { mapError } from "@/app/api/_lib/map-error";
import { createNotificationHandlers } from "@/src/training-institute/infrastructure/create-absence-notice-handlers";

import type { TrainingInstituteUnreadNotificationsResponseModel } from "../notification-models";
import { requireNotificationRecipient } from "../notification-session";

export const dynamic = "force-dynamic";

const handlers = createNotificationHandlers();

/** Mark every one of the session User's Notifications read. */
export async function POST(): Promise<Response> {
  try {
    const recipient = await requireNotificationRecipient();
    if (recipient instanceof Response) return recipient;
    const body: TrainingInstituteUnreadNotificationsResponseModel =
      await handlers.markAllRead(recipient);
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
