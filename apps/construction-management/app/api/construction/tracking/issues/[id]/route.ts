import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { issueActions } from "@/src/tracking/application/issue-handlers";

import { issueHandlers as handlers, requireIssueAccess } from "../handlers";
import {
  ConstructionTrackingIssueParamsModel,
  toIssueDetailResponse,
} from "../issue-models";

export const dynamic = "force-dynamic";

/**
 * One issue with its lifecycle history (read on its Project; without View
 * all, only one the caller created or is assigned to — 404 otherwise).
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionTrackingIssueParamsModel.safeParse(await context.params),
    );
    const session = await requireIssueAccess(request, id, "read");
    if (isResponse(session)) return session;
    const issue = await handlers.get(session.access, id);
    return Response.json(
      toIssueDetailResponse(issue, issueActions(session.access, issue)),
    );
  } catch (error) {
    return mapError(error);
  }
}
