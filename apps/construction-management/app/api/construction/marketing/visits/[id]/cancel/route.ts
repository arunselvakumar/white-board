import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { VISITS_MENU, visitHandlers as handlers } from "../../handlers";
import {
  CancelConstructionMarketingVisitRequestModel,
  ConstructionMarketingVisitParamsModel,
  toVisitResponse,
} from "../../visit-models";

export const dynamic = "force-dynamic";

/** Cancels a planned Visit, with a reason. Needs Visits update. */
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
      CancelConstructionMarketingVisitRequestModel.safeParse(
        await request.json(),
      ),
    );
    await handlers.cancel(session.access, id, {
      reason: model.reason,
      expectedUpdatedAt: new Date(model.expectedUpdatedAt),
    });
    return Response.json(
      toVisitResponse(await handlers.get(session.access, id)),
      {
        status: StatusCodes.OK,
      },
    );
  } catch (error) {
    return mapError(error);
  }
}
