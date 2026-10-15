import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { requireTaskAccess, taskHandlers as handlers } from "../../handlers";
import {
  ConstructionTrackingTaskParamsModel,
  toActivityResponse,
} from "../../task-models";

export const dynamic = "force-dynamic";

/** A task's activity feed, newest first, at most 200 rows (Task read). */
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
    const items = await handlers.activityList(session.access, id);
    return Response.json({ items: items.map(toActivityResponse) });
  } catch (error) {
    return mapError(error);
  }
}
