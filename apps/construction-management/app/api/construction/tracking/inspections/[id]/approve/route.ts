import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  inspectionHandlers as handlers,
  inspectionResponse,
  requireInspectionAccess,
} from "../../handlers";
import {
  ApproveConstructionTrackingInspectionRequestModel,
  ConstructionTrackingInspectionParamsModel,
} from "../../inspection-models";

export const dynamic = "force-dynamic";

/**
 * Approves a pending Inspection Request (Approve on its Project; anyone
 * with it, not only the inspector). 409 `INSPECTION_NOT_PENDING` once
 * decided.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionTrackingInspectionParamsModel.safeParse(await context.params),
    );
    const session = await requireInspectionAccess(request, id, "approve");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ApproveConstructionTrackingInspectionRequestModel.safeParse(
        await request.json(),
      ),
    );
    await handlers.decide(
      session.access,
      id,
      { approve: true },
      {
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
