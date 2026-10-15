import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { requireTaskAccess, taskHandlers as handlers } from "../../handlers";
import {
  ConstructionTrackingTaskParamsModel,
  toTaskDetailResponse,
  UpdateConstructionTrackingTaskRequestModel,
} from "../../task-models";

export const dynamic = "force-dynamic";

/**
 * Edits a task (CM-802). A summary task's dates, work and price are not
 * taken; a leaf with progress keeps its kind and unit (409
 * `TASK_HAS_PROGRESS`). Needs Task update; 409 `TASK_CHANGED` when stale.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionTrackingTaskParamsModel.safeParse(await context.params),
    );
    const session = await requireTaskAccess(request, id, "update");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      UpdateConstructionTrackingTaskRequestModel.safeParse(
        await request.json(),
      ),
    );
    await handlers.edit(
      session.access,
      id,
      new Date(model.expectedUpdatedAt),
      model,
    );
    return Response.json(
      toTaskDetailResponse(await handlers.get(session.access, id)),
    );
  } catch (error) {
    return mapError(error);
  }
}
