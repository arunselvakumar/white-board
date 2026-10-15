import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  requireProgressAccess,
  taskHandlers as handlers,
} from "../../../handlers";
import {
  ConstructionTrackingTaskProgressParamsModel,
  UpdateConstructionTrackingTaskProgressRequestModel,
} from "../../../task-models";

export const dynamic = "force-dynamic";

/**
 * Edits a manual progress update (CM-802): its author, or a member with
 * Task update. Worksheet updates are read-only here (409
 * `PROGRESS_FROM_WORKSHEET`); 409 `TASK_PROGRESS_CHANGED` when stale.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ progressId: string }> },
): Promise<Response> {
  try {
    const { progressId } = parseOrThrow(
      ConstructionTrackingTaskProgressParamsModel.safeParse(
        await context.params,
      ),
    );
    const session = await requireProgressAccess(request, progressId);
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      UpdateConstructionTrackingTaskProgressRequestModel.safeParse(
        await request.json(),
      ),
    );
    await handlers.editProgress(
      session.access,
      progressId,
      new Date(model.expectedUpdatedAt),
      { ...model, progressPct: model.progressPct ?? null },
    );
    return new Response(null, { status: 204 });
  } catch (error) {
    return mapError(error);
  }
}
