import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  inspectionHandlers as handlers,
  requireInspectionAccess,
} from "../../handlers";
import {
  ConstructionTrackingInspectionParamsModel,
  toReinspectionResponse,
} from "../../inspection-models";

export const dynamic = "force-dynamic";

/**
 * **Raise re-inspection** prefill (CM-0019 §10): department, contractor,
 * inspector, description, location and linked drawings of a rejected
 * request, keeping only what can still be picked. Needs Create on its
 * Project; 409 `INSPECTION_NOT_REJECTED` or
 * `INSPECTION_REINSPECTION_EXISTS`.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionTrackingInspectionParamsModel.safeParse(await context.params),
    );
    const session = await requireInspectionAccess(request, id, "create");
    if (isResponse(session)) return session;
    return Response.json(
      toReinspectionResponse(await handlers.reinspection(session.access, id)),
    );
  } catch (error) {
    return mapError(error);
  }
}
