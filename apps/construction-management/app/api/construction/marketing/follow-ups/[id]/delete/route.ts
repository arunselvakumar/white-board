import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  CloseConstructionMarketingFollowUpRequestModel,
  ConstructionMarketingFollowUpParamsModel,
} from "../../follow-up-models";
import { FOLLOW_UPS_MENU, followUpHandlers as handlers } from "../../handlers";

export const dynamic = "force-dynamic";

/** Deletes a Follow-up (a tombstone). Needs Follow-ups delete. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionMarketingFollowUpParamsModel.safeParse(await context.params),
    );
    const session = await requireAccess(request, FOLLOW_UPS_MENU, "delete");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      CloseConstructionMarketingFollowUpRequestModel.safeParse(
        await request.json(),
      ),
    );
    await handlers.delete(
      session.access,
      id,
      new Date(model.expectedUpdatedAt),
    );
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
