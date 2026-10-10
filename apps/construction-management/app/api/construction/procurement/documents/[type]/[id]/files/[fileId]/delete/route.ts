import { StatusCodes } from "http-status-codes";

import { mapError } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  documentFileParams,
  documentThread,
  requireDocumentSession,
  type DocumentFileContext,
} from "../../../../../handlers";

export const dynamic = "force-dynamic";

/**
 * Removes a file: a tombstone, out of the Gallery, then the object goes.
 * Update on the document's menu removes any file; Create only the
 * caller's own uploads.
 */
export async function POST(
  request: Request,
  context: DocumentFileContext,
): Promise<Response> {
  try {
    const session = await requireDocumentSession(request, { write: true });
    if (isResponse(session)) return session;
    const { type, id, fileId } = await documentFileParams(context);
    await documentThread.remove({
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
