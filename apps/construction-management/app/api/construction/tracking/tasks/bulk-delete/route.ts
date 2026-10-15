import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { requestProjectId } from "@/app/api/construction/tracking/project-scope";
import { requireTrackingProjectAccess } from "@/app/api/construction/tracking/tracking-access";

import { TASK_MENU, taskHandlers as handlers } from "../handlers";
import { BulkDeleteConstructionTrackingTasksRequestModel } from "../task-models";

export const dynamic = "force-dynamic";

/**
 * Deletes the chosen tasks and their sub-tasks (CM-802), all or none: 404
 * `TASK_NOT_FOUND` with `details.ids`; 409 `TASK_IN_USE` listing every
 * task a live Daily Worksheet names, with `details.worksheetCount`. Needs
 * Task delete on the Project.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const raw: unknown = await request.json();
    const session = await requireTrackingProjectAccess(
      request,
      TASK_MENU,
      "delete",
      requestProjectId(raw),
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      BulkDeleteConstructionTrackingTasksRequestModel.safeParse(raw),
    );
    return Response.json(
      await handlers.delete(session.access, model.projectId, model.ids),
    );
  } catch (error) {
    return mapError(error);
  }
}
