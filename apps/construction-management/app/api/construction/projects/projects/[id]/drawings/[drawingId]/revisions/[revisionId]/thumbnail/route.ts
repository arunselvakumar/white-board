import { thumbnailResponse } from "@/app/api/_lib/attachments";
import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { ConstructionProjectsDrawingRevisionParamsModel } from "../../../../drawing-models";
import { projectDrawings } from "../../../../handlers";

export const dynamic = "force-dynamic";

/** A revision's WebP thumbnail (CM-407); 404 `THUMBNAIL_NOT_FOUND` without one. */
export async function GET(
  request: Request,
  context: {
    params: Promise<{ id: string; drawingId: string; revisionId: string }>;
  },
): Promise<Response> {
  try {
    const session = await requireAccess(request, "projects.drawings", "read");
    if (isResponse(session)) return session;
    const { id, drawingId, revisionId } = parseOrThrow(
      ConstructionProjectsDrawingRevisionParamsModel.safeParse(
        await context.params,
      ),
    );
    return thumbnailResponse(
      await projectDrawings.readRevisionThumbnail(
        session.access,
        id,
        drawingId,
        revisionId,
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
