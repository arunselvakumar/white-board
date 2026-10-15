import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { requestProjectId } from "@/app/api/construction/tracking/project-scope";
import { requireTrackingProjectAccess } from "@/app/api/construction/tracking/tracking-access";

import { TASK_MENU, taskHandlers as handlers } from "../handlers";
import {
  GetConstructionTrackingTaskGanttRequestModel,
  toTaskResponse,
  type GetConstructionTrackingTaskGanttResponse,
} from "../task-models";

export const dynamic = "force-dynamic";

/**
 * Every row of the task tree for the read-only Gantt (CM-802, ADR CM-0019
 * §12), with the list's filters and View-all scoping, and the Company's
 * today for the Today line. Needs Task read on the Project.
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
    const model = parseOrThrow(
      GetConstructionTrackingTaskGanttRequestModel.safeParse(query),
    );
    const result = await handlers.gantt(session.access, model);
    const body: GetConstructionTrackingTaskGanttResponse = {
      items: result.items.map(toTaskResponse),
      today: result.today,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
