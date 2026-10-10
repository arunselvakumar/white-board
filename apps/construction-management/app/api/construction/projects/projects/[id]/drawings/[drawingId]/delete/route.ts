import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { ConstructionProjectsDrawingParamsModel } from "../../drawing-models";
import { projectDrawings } from "../../handlers";

export const dynamic = "force-dynamic";

/**
 * Deletes a drawing with every revision (CM-408): tombstones, out of the
 * Gallery, then the files go.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; drawingId: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, "projects.drawings", "delete");
    if (isResponse(session)) return session;
    const { id, drawingId } = parseOrThrow(
      ConstructionProjectsDrawingParamsModel.safeParse(await context.params),
    );
    await projectDrawings.deleteDrawing({
      viewer: session.access,
      projectId: id,
      drawingId,
      by: session.userId,
    });
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
