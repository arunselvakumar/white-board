import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { VISITS_MENU, visitHandlers as handlers } from "../handlers";
import {
  ConstructionMarketingVisitParamsModel,
  toVisitResponse,
} from "../visit-models";

export const dynamic = "force-dynamic";

/**
 * A Visit with its points of contact, notes and history. 404
 * `VISIT_NOT_FOUND` for another Company's, a deleted one, or one the
 * caller may not see. Needs Visits read.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, VISITS_MENU, "read");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionMarketingVisitParamsModel.safeParse(await context.params),
    );
    return Response.json(
      toVisitResponse(await handlers.get(session.access, id)),
    );
  } catch (error) {
    return mapError(error);
  }
}
