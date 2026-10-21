import { storedFileResponse } from "@/app/api/_lib/attachments";
import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { GetConstructionSalesDocumentFileQueryModel } from "../../../../document-models";
import {
  requireSalesDocumentSession,
  salesDocumentFileParams,
  salesFiles,
  type SalesDocumentFileContext,
} from "../../../../handlers";

export const dynamic = "force-dynamic";

/**
 * Streams one file (Read on the document's menu), never cached; a PDF or
 * an image is shown, `?download=1` saves it.
 */
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
    const query = parseOrThrow(
      GetConstructionSalesDocumentFileQueryModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const { file, object } = await salesFiles.read(
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
