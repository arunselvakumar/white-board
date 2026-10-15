import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { requireTrackingProjectAccess } from "@/app/api/construction/tracking/tracking-access";

import { ISSUE_MENU, issueHandlers as handlers } from "../handlers";
import {
  GetConstructionTrackingIssueFormOptionsRequestModel,
  toIssueFormOptions,
} from "../issue-models";

export const dynamic = "force-dynamic";

/**
 * The issue form's and filters' pickers on a Project (CM-803): active Team
 * Members on it ("Assign To"), enabled Departments and Issue Categories,
 * and active Contractors assigned to it. Needs Issues and snags read on
 * the Project.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      GetConstructionTrackingIssueFormOptionsRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const session = await requireTrackingProjectAccess(
      request,
      ISSUE_MENU,
      "read",
      model.projectId,
    );
    if (isResponse(session)) return session;
    return Response.json(
      toIssueFormOptions(
        await handlers.formOptions(session.workspaceId, model.projectId),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
