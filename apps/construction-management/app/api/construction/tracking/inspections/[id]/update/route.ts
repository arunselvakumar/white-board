import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  inspectionHandlers as handlers,
  inspectionResponse,
  requireInspectionAccess,
} from "../../handlers";
import {
  ConstructionTrackingInspectionParamsModel,
  UpdateConstructionTrackingInspectionRequestModel,
} from "../../inspection-models";

export const dynamic = "force-dynamic";

/**
 * Edits a pending Inspection Request (Update on its Project). 409
 * `INSPECTION_DECIDED` once approved or rejected, `INSPECTION_CHANGED`
 * when stale; the back-dated edit limit applies to the old and new date.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionTrackingInspectionParamsModel.safeParse(await context.params),
    );
    const session = await requireInspectionAccess(request, id, "update");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      UpdateConstructionTrackingInspectionRequestModel.safeParse(
        await request.json(),
      ),
    );
    await handlers.edit(
      session.access,
      id,
      new Date(model.expectedUpdatedAt),
      model,
    );
    return Response.json(await inspectionResponse(session, id));
  } catch (error) {
    return mapError(error);
  }
}
