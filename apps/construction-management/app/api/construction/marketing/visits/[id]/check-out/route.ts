import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { VISITS_MENU, visitHandlers as handlers } from "../../handlers";
import {
  CheckConstructionMarketingVisitRequestModel,
  ConstructionMarketingVisitParamsModel,
  toVisitResponse,
} from "../../visit-models";

export const dynamic = "force-dynamic";

/**
 * Checks out (ADR CM-0040 §10): a visitor, after checking in, on the
 * Visit's day, once. Takes one position from the browser, or why there is
 * none (`refused`, `unavailable`); the time is kept either way. Needs
 * Visits update.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionMarketingVisitParamsModel.safeParse(await context.params),
    );
    const session = await requireAccess(request, VISITS_MENU, "update");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      CheckConstructionMarketingVisitRequestModel.safeParse(
        await request.json(),
      ),
    );
    await handlers.checkOut(session.access, id, model);
    return Response.json(
      toVisitResponse(await handlers.get(session.access, id)),
    );
  } catch (error) {
    return mapError(error);
  }
}
