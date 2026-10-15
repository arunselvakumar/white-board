import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  requireProgressAccess,
  taskHandlers as handlers,
} from "../../../handlers";
import { ConstructionTrackingTaskProgressParamsModel } from "../../../task-models";

export const dynamic = "force-dynamic";

/**
 * Deletes a manual progress update (CM-802): its author, or a member with
 * Task update. The task's totals recompute and it reopens below 100 %.
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
    await handlers.deleteProgress(session.access, progressId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return mapError(error);
  }
}
