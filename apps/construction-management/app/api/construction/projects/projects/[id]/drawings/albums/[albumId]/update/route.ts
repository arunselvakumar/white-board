import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  ConstructionProjectsDrawingAlbumParamsModel,
  UpdateConstructionProjectsDrawingAlbumRequestModel,
} from "../../../drawing-models";
import { toAlbumResponse } from "../../../drawing-responses";
import { projectDrawings } from "../../../handlers";

export const dynamic = "force-dynamic";

/**
 * Renames an album (CM-408). 409 `ALBUM_CHANGED` on a stale `updatedAt`,
 * `ALBUM_NAME_IN_USE` for a name already in the Project.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; albumId: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, "projects.drawings", "update");
    if (isResponse(session)) return session;
    const { id, albumId } = parseOrThrow(
      ConstructionProjectsDrawingAlbumParamsModel.safeParse(
        await context.params,
      ),
    );
    const body = parseOrThrow(
      UpdateConstructionProjectsDrawingAlbumRequestModel.safeParse(
        await request.json(),
      ),
    );
    const album = await projectDrawings.renameAlbum({
      viewer: session.access,
      projectId: id,
      albumId,
      name: body.name,
      expectedUpdatedAt: new Date(body.updatedAt),
      by: session.userId,
    });
    const { drawings } = await projectDrawings.album(
      session.access,
      id,
      album.id,
    );
    return Response.json(toAlbumResponse(album, drawings.length));
  } catch (error) {
    return mapError(error);
  }
}
