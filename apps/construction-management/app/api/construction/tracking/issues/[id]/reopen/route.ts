import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { issueActions } from "@/src/tracking/application/issue-handlers";

import { issueHandlers as handlers, requireIssueAccess } from "../../handlers";
import {
  ConstructionTrackingIssueParamsModel,
  ReopenConstructionTrackingIssueRequestModel,
  toIssueDetailResponse,
} from "../../issue-models";

export const dynamic = "force-dynamic";

/**
 * **Reopen** (CM-0019 §8) with a required reason: a solved or closed issue
 * becomes open again, its Solved / Closed fields cleared and the reason
 * kept in the history. Needs reject on its Project; 409
 * `ISSUE_NOT_RESOLVED` for an open one.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionTrackingIssueParamsModel.safeParse(await context.params),
    );
    const session = await requireIssueAccess(request, id, "reject");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ReopenConstructionTrackingIssueRequestModel.safeParse(
        await request.json(),
      ),
    );
    await handlers.reopen(session.access, id, model.reason);
    const issue = await handlers.get(session.access, id);
    return Response.json(
      toIssueDetailResponse(issue, issueActions(session.access, issue)),
    );
  } catch (error) {
    return mapError(error);
  }
}
