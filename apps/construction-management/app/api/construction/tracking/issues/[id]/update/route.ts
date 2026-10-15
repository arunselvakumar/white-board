import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { issueActions } from "@/src/tracking/application/issue-handlers";

import { issueHandlers as handlers, requireIssueAccess } from "../../handlers";
import {
  ConstructionTrackingIssueParamsModel,
  toIssueDetailResponse,
  UpdateConstructionTrackingIssueRequestModel,
} from "../../issue-models";

export const dynamic = "force-dynamic";

/**
 * Edits an open (Pending or Delayed) issue (CM-803). Needs update on its
 * Project; 409 `ISSUE_NOT_OPEN` once solved or closed, 409 `ISSUE_CHANGED`
 * when `expectedUpdatedAt` is stale. The back-dated edit limit applies to
 * the old Issue Date and, when it changes, the new one.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionTrackingIssueParamsModel.safeParse(await context.params),
    );
    const session = await requireIssueAccess(request, id, "update");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      UpdateConstructionTrackingIssueRequestModel.safeParse(
        await request.json(),
      ),
    );
    await handlers.edit(
      session.access,
      id,
      new Date(model.expectedUpdatedAt),
      model,
    );
    const issue = await handlers.get(session.access, id);
    return Response.json(
      toIssueDetailResponse(issue, issueActions(session.access, issue)),
    );
  } catch (error) {
    return mapError(error);
  }
}
