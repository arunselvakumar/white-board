import { mapError } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { requestProjectId } from "@/app/api/construction/tracking/project-scope";
import { requireTrackingProjectAccess } from "@/app/api/construction/tracking/tracking-access";

import { TASK_MENU, taskHandlers as handlers } from "../handlers";
import { toTaskFormOptions } from "../task-models";

export const dynamic = "force-dynamic";

/**
 * What the task form and the list's filters offer (CM-802): Team Members
 * on the Project, enabled Departments and Units, active Contractors on the
 * Project, the Company's Tags. Needs Task read on the Project.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const query = Object.fromEntries(new URL(request.url).searchParams);
    const session = await requireTrackingProjectAccess(
      request,
      TASK_MENU,
      "read",
      requestProjectId(query),
    );
    if (isResponse(session)) return session;
    return Response.json(
      toTaskFormOptions(
        await handlers.formOptions(session.workspaceId, session.project.id),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
