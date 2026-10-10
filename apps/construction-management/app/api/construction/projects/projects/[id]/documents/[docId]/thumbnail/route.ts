import { thumbnailResponse } from "@/app/api/_lib/attachments";
import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { projectDocuments } from "../../handlers";
import { ConstructionProjectsDocumentParamsModel } from "../../project-document-models";

export const dynamic = "force-dynamic";

/** A document's WebP thumbnail (CM-407); 404 `THUMBNAIL_NOT_FOUND` without one. */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; docId: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, "projects.project", "read");
    if (isResponse(session)) return session;
    const { id, docId } = parseOrThrow(
      ConstructionProjectsDocumentParamsModel.safeParse(await context.params),
    );
    return thumbnailResponse(
      await projectDocuments.readThumbnail(session.access, id, docId),
    );
  } catch (error) {
    return mapError(error);
  }
}
