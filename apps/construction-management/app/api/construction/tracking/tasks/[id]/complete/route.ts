import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { requireTaskAccess, taskHandlers as handlers } from "../../handlers";
import {
  CompleteConstructionTrackingTaskRequestModel,
  ConstructionTrackingTaskParamsModel,
} from "../../task-models";

export const dynamic = "force-dynamic";

/**
 * **Mark As Completed** (CM-802): records the update that brings a leaf
 * task to 100 % (the remaining quantity, or 100 %) on the date given,
 * today by default. 409 `TASK_ALREADY_COMPLETED`. Needs Task update.
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
      CompleteConstructionTrackingTaskRequestModel.safeParse(
        await request.json(),
      ),
    );
    const progressId = await handlers.markCompleted(session.access, id, model);
    return Response.json({ id: progressId }, { status: StatusCodes.CREATED });
  } catch (error) {
    return mapError(error);
  }
}
