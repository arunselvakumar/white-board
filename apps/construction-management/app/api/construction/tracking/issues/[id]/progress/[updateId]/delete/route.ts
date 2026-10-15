import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  issueHandlers as handlers,
  requireIssueAccess,
} from "../../../../handlers";
import { ConstructionTrackingIssueProgressParamsModel } from "../../../../issue-models";

export const dynamic = "force-dynamic";

/**
 * Deletes a Progress update with its images (CM-0019 §7): only its author,
 * within 24 hours of posting it (403 `ISSUE_UPDATE_NOT_YOURS`, 409
 * `ISSUE_UPDATE_TOO_OLD`). Needs read on the issue's Project.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; updateId: string }> },
): Promise<Response> {
  try {
    const { id, updateId } = parseOrThrow(
      ConstructionTrackingIssueProgressParamsModel.safeParse(
        await context.params,
      ),
    );
    const session = await requireIssueAccess(request, id, "read");
    if (isResponse(session)) return session;
    await handlers.deleteUpdate(session.access, id, updateId);
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
