import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { ConstructionProjectsDrawingAlbumParamsModel } from "../../drawing-models";
import { toAlbumResponse, toDrawingResponse } from "../../drawing-responses";
import { projectDrawings } from "../../handlers";

export const dynamic = "force-dynamic";

/** An album and its drawings, each with its latest revision (CM-408). */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; albumId: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, "projects.drawings", "read");
    if (isResponse(session)) return session;
    const { id, albumId } = parseOrThrow(
      ConstructionProjectsDrawingAlbumParamsModel.safeParse(
        await context.params,
      ),
    );
    const { album, drawings } = await projectDrawings.album(
      session.access,
      id,
      albumId,
    );
    return Response.json({
      album: toAlbumResponse(album, drawings.length),
      drawings: drawings.map(toDrawingResponse),
    });
  } catch (error) {
    return mapError(error);
  }
}
