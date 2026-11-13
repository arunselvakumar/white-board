import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { VISITS_MENU, visitHandlers as handlers } from "../../handlers";
import {
  CompleteConstructionMarketingVisitRequestModel,
  ConstructionMarketingVisitParamsModel,
  toVisitResponse,
} from "../../visit-models";

export const dynamic = "force-dynamic";

/**
 * Completes a planned Visit: when it happened (not in the future, within
 * the back-dated limit), a point of contact and the Discussion. Its
 * company moves from New to Contacted. Needs Visits read and update.
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
      CompleteConstructionMarketingVisitRequestModel.safeParse(
        await request.json(),
      ),
    );
    await handlers.complete(session.access, id, {
      ...model,
      visitAt: new Date(model.visitAt),
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
