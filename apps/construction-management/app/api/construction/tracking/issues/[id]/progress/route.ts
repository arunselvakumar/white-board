import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { issueHandlers as handlers, requireIssueAccess } from "../../handlers";
import {
  ConstructionTrackingIssueParamsModel,
  PostConstructionTrackingIssueProgressRequestModel,
  toIssueProgressResponse,
  type ListConstructionTrackingIssueProgressResponse,
} from "../../issue-models";

export const dynamic = "force-dynamic";

/** The issue's Progress thread, oldest first (read on its Project). */
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
    const body: ListConstructionTrackingIssueProgressResponse = {
      items: (await handlers.updates(session.access, id)).map(
        toIssueProgressResponse,
      ),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Posts a Progress update (CM-0019 §7): a comment, images, or both. With
 * `withImages` the comment may be empty; the screen uploads the images as
 * files of the new update. Needs update on its Project; any status.
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
      PostConstructionTrackingIssueProgressRequestModel.safeParse(
        await request.json(),
      ),
    );
    const updateId = await handlers.postUpdate(session.access, id, model);
    const update = (await handlers.updates(session.access, id)).find(
      (item) => item.id === updateId,
    );
    if (update == null) throw new Error("The new update was not found.");
    return Response.json(toIssueProgressResponse(update), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
