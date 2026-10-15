import { mapError } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { requestProjectId } from "@/app/api/construction/tracking/project-scope";
import { requireTrackingProjectAccess } from "@/app/api/construction/tracking/tracking-access";

import { INSPECTION_MENU, inspectionHandlers as handlers } from "../handlers";
import { toInspectionFormOptions } from "../inspection-models";

export const dynamic = "force-dynamic";

/**
 * The inspectors (active Team Members on the Project), enabled
 * Departments, Contractors on the Project and the Project's Drawings, for
 * the request form and the list's filters. Needs Inspection Request read.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const query = Object.fromEntries(new URL(request.url).searchParams);
    const projectId = requestProjectId(query);
    const session = await requireTrackingProjectAccess(
      request,
      INSPECTION_MENU,
      "read",
      projectId,
    );
    if (isResponse(session)) return session;
    return Response.json(
      toInspectionFormOptions(
        await handlers.formOptions(session.workspaceId, projectId),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
