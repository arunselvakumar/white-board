import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { ConstructionProjectsProjectParamsModel } from "../../../project-models";
import { CreateConstructionProjectsDrawingAlbumRequestModel } from "../drawing-models";
import { toAlbumListItem } from "../drawing-responses";
import { projectDrawings } from "../handlers";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** The Project's drawing albums by name, with drawing counts (CM-408). */
export async function GET(
  request: Request,
  context: Context,
): Promise<Response> {
  try {
    const session = await requireAccess(request, "projects.drawings", "read");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionProjectsProjectParamsModel.safeParse(await context.params),
    );
    const albums = await projectDrawings.albums(session.access, id);
    return Response.json({ items: albums.map(toAlbumListItem) });
  } catch (error) {
    return mapError(error);
  }
}

/** Adds an album; 409 `ALBUM_NAME_IN_USE` for a name already used. */
export async function POST(
  request: Request,
  context: Context,
): Promise<Response> {
  try {
    const session = await requireAccess(request, "projects.drawings", "create");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionProjectsProjectParamsModel.safeParse(await context.params),
    );
    const body = parseOrThrow(
      CreateConstructionProjectsDrawingAlbumRequestModel.safeParse(
        await request.json(),
      ),
    );
    const album = await projectDrawings.addAlbum({
      viewer: session.access,
      projectId: id,
      name: body.name,
      by: session.userId,
    });
    return Response.json(toAlbumListItem(album), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
