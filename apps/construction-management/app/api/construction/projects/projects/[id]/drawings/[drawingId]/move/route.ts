import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  ConstructionProjectsDrawingParamsModel,
  MoveConstructionProjectsDrawingRequestModel,
} from "../../drawing-models";
import { toDrawingDetailResponse } from "../../drawing-responses";
import { projectDrawings } from "../../handlers";

export const dynamic = "force-dynamic";

/**
 * Moves a drawing to another album of the Project (CM-408). 404
 * `ALBUM_NOT_FOUND` for an album that is not the Project's; 409
 * `DRAWING_CHANGED` on a stale `updatedAt`.
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
      MoveConstructionProjectsDrawingRequestModel.safeParse(
        await request.json(),
      ),
    );
    const drawing = await projectDrawings.updateDrawing({
      viewer: session.access,
      projectId: id,
      drawingId,
      albumId: body.albumId,
      expectedUpdatedAt: new Date(body.updatedAt),
      by: session.userId,
    });
    return Response.json(toDrawingDetailResponse(drawing));
  } catch (error) {
    return mapError(error);
  }
}
