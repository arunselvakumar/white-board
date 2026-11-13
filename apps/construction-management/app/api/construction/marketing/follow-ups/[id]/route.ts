import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  ConstructionMarketingFollowUpParamsModel,
  toFollowUpResponse,
} from "../follow-up-models";
import { FOLLOW_UPS_MENU, followUpHandlers as handlers } from "../handlers";

export const dynamic = "force-dynamic";

/** One Follow-up; 404 `FOLLOW_UP_NOT_FOUND` for one the caller may not see. */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, FOLLOW_UPS_MENU, "read");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionMarketingFollowUpParamsModel.safeParse(await context.params),
    );
    return Response.json(
      toFollowUpResponse(await handlers.get(session.access, id)),
    );
  } catch (error) {
    return mapError(error);
  }
}
