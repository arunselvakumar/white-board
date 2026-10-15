import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { issueActions } from "@/src/tracking/application/issue-handlers";

import { issueHandlers as handlers, requireIssueAccess } from "../../handlers";
import {
  ConstructionTrackingIssueParamsModel,
  toIssueDetailResponse,
} from "../../issue-models";

export const dynamic = "force-dynamic";

/**
 * **Verify** (CM-0019 §8): a solved issue becomes closed, recording Closed
 * On / By. Needs approve on its Project; 409 `ISSUE_NOT_SOLVED` otherwise.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionTrackingIssueParamsModel.safeParse(await context.params),
    );
    const session = await requireIssueAccess(request, id, "approve");
    if (isResponse(session)) return session;
    await handlers.verify(session.access, id);
    const issue = await handlers.get(session.access, id);
    return Response.json(
      toIssueDetailResponse(issue, issueActions(session.access, issue)),
    );
  } catch (error) {
    return mapError(error);
  }
}
