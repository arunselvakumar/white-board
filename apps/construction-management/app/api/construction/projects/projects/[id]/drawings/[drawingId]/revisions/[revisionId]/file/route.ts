import {
  FileDownloadQueryModel,
  storedFileResponse,
} from "@/app/api/_lib/attachments";
import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { ConstructionProjectsDrawingRevisionParamsModel } from "../../../../drawing-models";
import { projectDrawings } from "../../../../handlers";

export const dynamic = "force-dynamic";

/**
 * Streams one revision (CM-408): a PDF or an image is shown, a DWG or DXF
 * downloads; `?download=1` always downloads. The Gallery links here, so a
 * member without `projects.drawings` read gets 403.
 */
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
    const query = parseOrThrow(
      FileDownloadQueryModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const { revision, object } = await projectDrawings.readRevision(
      session.access,
      id,
      drawingId,
      revisionId,
    );
    return storedFileResponse(revision, object, query.download === "1");
  } catch (error) {
    return mapError(error);
  }
}
