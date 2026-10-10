import { storedFileResponse } from "@/app/api/_lib/attachments";
import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { GetConstructionProcurementDocumentFileQueryModel } from "../../../../document-models";
import {
  documentFileParams,
  documentThread,
  requireDocumentSession,
  type DocumentFileContext,
} from "../../../../handlers";

export const dynamic = "force-dynamic";

/**
 * Streams one of the document's files (Read on its menu) with the type
 * sniffed at upload, never cached (`private, no-store`): a PDF or an image
 * is shown, anything else downloads; `?download=1` always downloads.
 */
export async function GET(
  request: Request,
  context: DocumentFileContext,
): Promise<Response> {
  try {
    const session = await requireDocumentSession(request, { write: false });
    if (isResponse(session)) return session;
    const { type, id, fileId } = await documentFileParams(context);
    const query = parseOrThrow(
      GetConstructionProcurementDocumentFileQueryModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const { file, object } = await documentThread.read(
      session.access,
      type,
      id,
      fileId,
    );
    return storedFileResponse(
      {
        contentType: file.contentType,
        fileName: file.fileName,
        viewable: file.viewable,
      },
      object,
      query.download === "1",
    );
  } catch (error) {
    return mapError(error);
  }
}
