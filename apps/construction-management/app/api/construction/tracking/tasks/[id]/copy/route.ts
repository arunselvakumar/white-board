import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { requireTaskAccess, taskHandlers as handlers } from "../../handlers";
import { ConstructionTrackingTaskParamsModel } from "../../task-models";

export const dynamic = "force-dynamic";

/**
 * **Copy task** (CM-802): a copy of the task and its sub-tasks right after
 * it, without progress, activity, actuals or baseline. Needs Task create.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionTrackingTaskParamsModel.safeParse(await context.params),
    );
    const session = await requireTaskAccess(request, id, "create");
    if (isResponse(session)) return session;
    const copyId = await handlers.copy(session.access, id);
    return Response.json({ id: copyId }, { status: StatusCodes.CREATED });
  } catch (error) {
    return mapError(error);
  }
}
