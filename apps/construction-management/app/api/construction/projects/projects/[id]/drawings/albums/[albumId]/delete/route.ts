import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { ConstructionProjectsDrawingAlbumParamsModel } from "../../../drawing-models";
import { projectDrawings } from "../../../handlers";

export const dynamic = "force-dynamic";

/** Deletes an empty album (CM-408); 409 `ALBUM_NOT_EMPTY` while it has drawings. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; albumId: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, "projects.drawings", "delete");
    if (isResponse(session)) return session;
    const { id, albumId } = parseOrThrow(
      ConstructionProjectsDrawingAlbumParamsModel.safeParse(
        await context.params,
      ),
    );
    await projectDrawings.deleteAlbum({
      viewer: session.access,
      projectId: id,
      albumId,
      by: session.userId,
    });
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
