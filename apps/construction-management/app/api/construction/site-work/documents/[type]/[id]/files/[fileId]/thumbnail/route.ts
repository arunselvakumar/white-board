import { thumbnailResponse } from "@/app/api/_lib/attachments";
import { mapError } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  documentFileParams,
  documentThread,
  requireDocumentSession,
  type DocumentFileContext,
} from "../../../../../handlers";

export const dynamic = "force-dynamic";

/** An image file's WebP thumbnail; 404 `THUMBNAIL_NOT_FOUND` without one. */
export async function GET(
  request: Request,
  context: DocumentFileContext,
): Promise<Response> {
  try {
    const session = await requireDocumentSession(request, { write: false });
    if (isResponse(session)) return session;
    const { type, id, fileId } = await documentFileParams(context);
    return thumbnailResponse(
      await documentThread.readThumbnail(session.access, type, id, fileId),
    );
  } catch (error) {
    return mapError(error);
  }
}
