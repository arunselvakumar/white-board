import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { requestProjectId } from "@/app/api/construction/tracking/project-scope";
import { requireTrackingProjectAccess } from "@/app/api/construction/tracking/tracking-access";

import { INSPECTION_MENU, inspectionHandlers as handlers } from "../handlers";
import {
  BulkRejectConstructionTrackingInspectionsRequestModel,
  toBulkDecideResponse,
} from "../inspection-models";

export const dynamic = "force-dynamic";

/**
 * Rejects the selected **pending** Inspection Requests of one Project with
 * one reason; the others are skipped and counted. With `raiseSnag`, one
 * Issue & Snag per rejected request in the same transaction (needs Issues
 * & Snags Create). Needs Reject on the Project.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const raw: unknown = await request.json();
    const session = await requireTrackingProjectAccess(
      request,
      INSPECTION_MENU,
      "reject",
      requestProjectId(raw),
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      BulkRejectConstructionTrackingInspectionsRequestModel.safeParse(raw),
    );
    const outcome = await handlers.bulkDecide(
      session.access,
      model.projectId,
      model.ids,
      { approve: false, reason: model.reason },
      model.raiseSnag,
    );
    return Response.json(toBulkDecideResponse(outcome));
  } catch (error) {
    return mapError(error);
  }
}
