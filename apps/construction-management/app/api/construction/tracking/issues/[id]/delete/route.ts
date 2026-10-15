import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { issueHandlers as handlers, requireIssueAccess } from "../../handlers";
import {
  ConstructionTrackingIssueParamsModel,
  DeleteConstructionTrackingIssueRequestModel,
} from "../../issue-models";

export const dynamic = "force-dynamic";

/**
 * Deletes an issue (a tombstone; its number is never reused) and takes its
 * files out of the Gallery. Needs delete on its Project; the back-dated
 * edit limit applies to its Issue Date.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionTrackingIssueParamsModel.safeParse(await context.params),
    );
    const session = await requireIssueAccess(request, id, "delete");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      DeleteConstructionTrackingIssueRequestModel.safeParse(
        await request.json(),
      ),
    );
    await handlers.delete(
      session.access,
      id,
      new Date(model.expectedUpdatedAt),
    );
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
