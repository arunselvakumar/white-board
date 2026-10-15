import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  inspectionHandlers as handlers,
  inspectionResponse,
  requireInspectionAccess,
} from "../../handlers";
import {
  ConstructionTrackingInspectionParamsModel,
  RejectConstructionTrackingInspectionRequestModel,
} from "../../inspection-models";

export const dynamic = "force-dynamic";

/**
 * Rejects a pending Inspection Request with a reason (Reject on its
 * Project). With `raiseSnag`, **Also raise a snag**: an Issue & Snag in the
 * same transaction, listed in the response's `snags`. 409
 * `INSPECTION_NOT_PENDING` once decided.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionTrackingInspectionParamsModel.safeParse(await context.params),
    );
    const session = await requireInspectionAccess(request, id, "reject");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      RejectConstructionTrackingInspectionRequestModel.safeParse(
        await request.json(),
      ),
    );
    await handlers.decide(
      session.access,
      id,
      { approve: false, reason: model.reason },
      {
        raiseSnag: model.raiseSnag,
        expectedUpdatedAt:
          model.expectedUpdatedAt == null
            ? undefined
            : new Date(model.expectedUpdatedAt),
      },
    );
    return Response.json(await inspectionResponse(session, id));
  } catch (error) {
    return mapError(error);
  }
}
