import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { requireTaskAccess, taskHandlers as handlers } from "../../handlers";
import {
  ConstructionTrackingTaskParamsModel,
  RecordConstructionTrackingTaskProgressRequestModel,
  toProgressResponse,
} from "../../task-models";

export const dynamic = "force-dynamic";

/** A task's progress updates, newest first (Task read). */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionTrackingTaskParamsModel.safeParse(await context.params),
    );
    const session = await requireTaskAccess(request, id, "read");
    if (isResponse(session)) return session;
    const items = await handlers.progressList(session.access, id);
    return Response.json({ items: items.map(toProgressResponse) });
  } catch (error) {
    return mapError(error);
  }
}

/**
 * **Update Task Progress** (CM-802): a quantity task takes the work done
 * in this update, a percent task the new percentage; not after today;
 * leaf tasks only (409 `TASK_IS_SUMMARY`). Needs Task update.
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
      RecordConstructionTrackingTaskProgressRequestModel.safeParse(
        await request.json(),
      ),
    );
    const progressId = await handlers.recordProgress(session.access, id, {
      ...model,
      progressPct: model.progressPct ?? null,
    });
    return Response.json({ id: progressId }, { status: StatusCodes.CREATED });
  } catch (error) {
    return mapError(error);
  }
}
