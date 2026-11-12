import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  UpdateConstructionMarketingFollowUpRequestModel,
  ConstructionMarketingFollowUpParamsModel,
  toFollowUpResponse,
} from "../../follow-up-models";
import { FOLLOW_UPS_MENU, followUpHandlers as handlers } from "../../handlers";

export const dynamic = "force-dynamic";

/**
 * Changes an Open Follow-up; a new due date clears its reminders. Needs
 * Follow-ups update.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionMarketingFollowUpParamsModel.safeParse(await context.params),
    );
    const session = await requireAccess(request, FOLLOW_UPS_MENU, "update");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      UpdateConstructionMarketingFollowUpRequestModel.safeParse(
        await request.json(),
      ),
    );
    await handlers.update(session.access, id, {
      ...model,
      expectedUpdatedAt: new Date(model.expectedUpdatedAt),
    });
    return Response.json(
      toFollowUpResponse(await handlers.get(session.access, id)),
    );
  } catch (error) {
    return mapError(error);
  }
}
