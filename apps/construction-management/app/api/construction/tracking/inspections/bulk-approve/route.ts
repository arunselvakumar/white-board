import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { requestProjectId } from "@/app/api/construction/tracking/project-scope";
import { requireTrackingProjectAccess } from "@/app/api/construction/tracking/tracking-access";

import { INSPECTION_MENU, inspectionHandlers as handlers } from "../handlers";
import {
  BulkApproveConstructionTrackingInspectionsRequestModel,
  toBulkDecideResponse,
} from "../inspection-models";

export const dynamic = "force-dynamic";

/**
 * Approves the selected **pending** Inspection Requests of one Project;
 * the others (already decided, deleted, another Project's) are skipped
 * and counted (CM-0019 §9). Needs Approve on the Project.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const raw: unknown = await request.json();
    const session = await requireTrackingProjectAccess(
      request,
      INSPECTION_MENU,
      "approve",
      requestProjectId(raw),
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      BulkApproveConstructionTrackingInspectionsRequestModel.safeParse(raw),
    );
    const outcome = await handlers.bulkDecide(
      session.access,
      model.projectId,
      model.ids,
      { approve: true },
      false,
    );
    return Response.json(toBulkDecideResponse(outcome));
  } catch (error) {
    return mapError(error);
  }
}
