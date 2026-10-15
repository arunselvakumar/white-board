import { thumbnailResponse } from "@/app/api/_lib/attachments";
import { mapError } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  requireTrackingDocumentSession,
  trackingDocumentFileParams,
  trackingFiles,
  type TrackingDocumentFileContext,
} from "../../../../../handlers";

export const dynamic = "force-dynamic";

/** An image file's WebP thumbnail; 404 `THUMBNAIL_NOT_FOUND` without one. */
export async function GET(
  request: Request,
  context: TrackingDocumentFileContext,
): Promise<Response> {
  try {
    const session = await requireTrackingDocumentSession(request, {
      write: false,
    });
    if (isResponse(session)) return session;
    const { type, id, fileId } = await trackingDocumentFileParams(context);
    return thumbnailResponse(
      await trackingFiles.readThumbnail(session.access, type, id, fileId),
    );
  } catch (error) {
    return mapError(error);
  }
}
