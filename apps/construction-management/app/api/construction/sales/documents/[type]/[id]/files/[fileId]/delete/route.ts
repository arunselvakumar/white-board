import { StatusCodes } from "http-status-codes";

import { mapError } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  requireSalesDocumentSession,
  salesDocumentFileParams,
  salesFiles,
  type SalesDocumentFileContext,
} from "../../../../../handlers";

export const dynamic = "force-dynamic";

/** Removes a file: Update on the document's menu, or the uploader's own. */
export async function POST(
  request: Request,
  context: SalesDocumentFileContext,
): Promise<Response> {
  try {
    const session = await requireSalesDocumentSession(request, {
      write: true,
    });
    if (isResponse(session)) return session;
    const { type, id, fileId } = await salesDocumentFileParams(context);
    await salesFiles.remove({
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
