import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { requireTaskAccess, taskHandlers as handlers } from "../../handlers";
import {
  ConstructionTrackingTaskParamsModel,
  RebaselineConstructionTrackingTaskRequestModel,
  toTaskDetailResponse,
} from "../../task-models";

export const dynamic = "force-dynamic";

/**
 * **Re-baseline** (CM-802): the planned dates become the next baseline
 * version, with a reason. Leaf tasks with both dates (409
 * `TASK_IS_SUMMARY`, 400 `TASK_DATES_REQUIRED`). Needs Task update.
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
      RebaselineConstructionTrackingTaskRequestModel.safeParse(
        await request.json(),
      ),
    );
    await handlers.rebaseline(session.access, id, {
      reason: model.reason,
      expectedUpdatedAt:
        model.expectedUpdatedAt == null
          ? null
          : new Date(model.expectedUpdatedAt),
    });
    return Response.json(
      toTaskDetailResponse(await handlers.get(session.access, id)),
    );
  } catch (error) {
    return mapError(error);
  }
}
