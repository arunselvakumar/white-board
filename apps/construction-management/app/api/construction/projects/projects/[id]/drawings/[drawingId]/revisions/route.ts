import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  AddConstructionProjectsDrawingRevisionRequestModel,
  ConstructionProjectsDrawingParamsModel,
} from "../../drawing-models";
import { toDrawingDetailResponse } from "../../drawing-responses";
import { projectDrawings } from "../../handlers";

export const dynamic = "force-dynamic";

/**
 * Finishes uploading a new revision of a drawing (CM-408): the next R
 * number. 201 for a new revision, 200 when the key was already recorded.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; drawingId: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, "projects.drawings", "update");
    if (isResponse(session)) return session;
    const { id, drawingId } = parseOrThrow(
      ConstructionProjectsDrawingParamsModel.safeParse(await context.params),
    );
    const body = parseOrThrow(
      AddConstructionProjectsDrawingRevisionRequestModel.safeParse(
        await request.json(),
      ),
    );
    const { drawing, created } = await projectDrawings.addRevision({
      viewer: session.access,
      projectId: id,
      drawingId,
      key: body.key,
      fileName: body.fileName,
      by: session.userId,
    });
    return Response.json(toDrawingDetailResponse(drawing), {
      status: created ? StatusCodes.CREATED : StatusCodes.OK,
    });
  } catch (error) {
    return mapError(error);
  }
}
