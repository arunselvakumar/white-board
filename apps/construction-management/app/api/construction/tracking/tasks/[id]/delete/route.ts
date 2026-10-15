import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { requireTaskAccess, taskHandlers as handlers } from "../../handlers";
import {
  ConstructionTrackingTaskParamsModel,
  DeleteConstructionTrackingTaskRequestModel,
} from "../../task-models";

export const dynamic = "force-dynamic";

/**
 * Deletes a task and its sub-tasks (CM-802). 409 `TASK_IN_USE` when a live
 * Daily Worksheet names it or a sub-task. Needs Task delete.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionTrackingTaskParamsModel.safeParse(await context.params),
    );
    const session = await requireTaskAccess(request, id, "delete");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      DeleteConstructionTrackingTaskRequestModel.safeParse(
        await request.json(),
      ),
    );
    return Response.json(
      await handlers.delete(
        session.access,
        session.target.projectId,
        [id],
        model.expectedUpdatedAt == null
          ? null
          : new Date(model.expectedUpdatedAt),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
