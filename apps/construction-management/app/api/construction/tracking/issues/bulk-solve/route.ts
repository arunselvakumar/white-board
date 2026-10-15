import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { requestProjectId } from "@/app/api/construction/tracking/project-scope";
import { requireTrackingProjectAccess } from "@/app/api/construction/tracking/tracking-access";

import { ISSUE_MENU, issueHandlers as handlers } from "../handlers";
import {
  BulkConstructionTrackingIssuesRequestModel,
  toBulkResponse,
} from "../issue-models";

export const dynamic = "force-dynamic";

/**
 * Bulk **Mark As Solved** (CM-0019 §8): every selected open (Pending or Delayed) issue becomes solved, recording Solved On / By. Needs update
 * on the Project. Issues in another state, of another Project or not
 * visible to the caller are skipped and counted.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const raw: unknown = await request.json();
    const session = await requireTrackingProjectAccess(
      request,
      ISSUE_MENU,
      "update",
      requestProjectId(raw),
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      BulkConstructionTrackingIssuesRequestModel.safeParse(raw),
    );
    return Response.json(
      toBulkResponse(
        await handlers.bulkSolve(session.access, model.projectId, model.ids),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
