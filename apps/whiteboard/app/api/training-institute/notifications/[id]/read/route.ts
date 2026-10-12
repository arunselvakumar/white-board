import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { createNotificationHandlers } from "@/src/training-institute/infrastructure/create-absence-notice-handlers";

import {
  TrainingInstituteNotificationIdParamsModel,
  type TrainingInstituteNotificationModel,
} from "../../notification-models";
import { requireNotificationRecipient } from "../../notification-session";

export const dynamic = "force-dynamic";

const handlers = createNotificationHandlers();

/** Mark one of the session User's Notifications read. */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const recipient = await requireNotificationRecipient();
    if (recipient instanceof Response) return recipient;
    const { id } = parseOrThrow(
      TrainingInstituteNotificationIdParamsModel.safeParse(
        await context.params,
      ),
    );
    const body: TrainingInstituteNotificationModel = await handlers.markRead(
      recipient,
      id,
    );
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
