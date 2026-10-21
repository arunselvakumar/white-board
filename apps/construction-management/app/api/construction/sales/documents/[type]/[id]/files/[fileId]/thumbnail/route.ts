import { thumbnailResponse } from "@/app/api/_lib/attachments";
import { mapError } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  requireSalesDocumentSession,
  salesDocumentFileParams,
  salesFiles,
  type SalesDocumentFileContext,
} from "../../../../../handlers";

export const dynamic = "force-dynamic";

/** An image's WebP thumbnail; 404 `THUMBNAIL_NOT_FOUND` without one. */
export async function GET(
  request: Request,
  context: SalesDocumentFileContext,
): Promise<Response> {
  try {
    const session = await requireSalesDocumentSession(request, {
      write: false,
    });
    if (isResponse(session)) return session;
    const { type, id, fileId } = await salesDocumentFileParams(context);
    return thumbnailResponse(
      await salesFiles.readThumbnail(session.access, type, id, fileId),
    );
  } catch (error) {
    return mapError(error);
  }
}
