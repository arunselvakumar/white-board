import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requirePlanActive } from "@/app/api/_lib/require-plan-active";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  inspectionHandlers as handlers,
  requireInspectionAccess,
} from "../../../../handlers";
import { ConstructionTrackingInspectionObservationParamsModel } from "../../../../inspection-models";

export const dynamic = "force-dynamic";

/**
 * Deletes the caller's own observation while the request is pending (403
 * for someone else's; 409 `INSPECTION_DECIDED` once decided).
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; observationId: string }> },
): Promise<Response> {
  try {
    const { id, observationId } = parseOrThrow(
      ConstructionTrackingInspectionObservationParamsModel.safeParse(
        await context.params,
      ),
    );
    const session = await requireInspectionAccess(request, id, "read");
    if (isResponse(session)) return session;
    const ended = await requirePlanActive(session);
    if (ended != null) return ended;
    await handlers.deleteObservation(session.access, id, observationId);
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
