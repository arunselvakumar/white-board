import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { requireTaskAccess, taskHandlers as handlers } from "../handlers";
import {
  ConstructionTrackingTaskParamsModel,
  toTaskDetailResponse,
} from "../task-models";

export const dynamic = "force-dynamic";

/**
 * One task (CM-802): its figures and roll-ups, its sub-tasks, its
 * ancestors and its baseline history. Task read on its Project; without
 * View all, only the caller's own and assigned tasks.
 */
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
    return Response.json(
      toTaskDetailResponse(await handlers.get(session.access, id)),
    );
  } catch (error) {
    return mapError(error);
  }
}
