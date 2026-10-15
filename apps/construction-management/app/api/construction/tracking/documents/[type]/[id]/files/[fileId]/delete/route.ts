import { StatusCodes } from "http-status-codes";

import { mapError } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  requireTrackingDocumentSession,
  trackingDocumentFileParams,
  trackingFiles,
  type TrackingDocumentFileContext,
} from "../../../../../handlers";

export const dynamic = "force-dynamic";

/**
 * Removes a file: a tombstone, out of the Gallery, then the object goes.
 * Update on the document's menu removes any file; an uploader their own.
 */
export async function POST(
  request: Request,
  context: TrackingDocumentFileContext,
): Promise<Response> {
  try {
    const session = await requireTrackingDocumentSession(request, {
      write: true,
    });
    if (isResponse(session)) return session;
    const { type, id, fileId } = await trackingDocumentFileParams(context);
    await trackingFiles.remove({
      viewer: session.access,
      type,
      documentId: id,
      fileId,
    });
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
