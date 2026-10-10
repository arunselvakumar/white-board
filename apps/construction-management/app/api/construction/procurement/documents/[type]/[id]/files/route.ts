import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  AddConstructionProcurementDocumentFileRequestModel,
  type ListConstructionProcurementDocumentFilesResponseModel,
} from "../../../document-models";
import { toDocumentFileResponse } from "../../../document-responses";
import {
  documentParams,
  documentThread,
  requireDocumentSession,
  type DocumentContext,
} from "../../../handlers";

export const dynamic = "force-dynamic";

/**
 * The document's live files, oldest first, with the bytes they take (Read
 * on its menu). Files posted with a remark carry its `remarkId`.
 */
export async function GET(
  request: Request,
  context: DocumentContext,
): Promise<Response> {
  try {
    const session = await requireDocumentSession(request, { write: false });
    if (isResponse(session)) return session;
    const { type, id } = await documentParams(context);
    const { files, rights } = await documentThread.files(
      session.access,
      type,
      id,
    );
    const body: ListConstructionProcurementDocumentFilesResponseModel = {
      items: files.map(toDocumentFileResponse),
      totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
      canUpload: rights.upload,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Finishes an upload (step 3): records the file now at `key` (Create or
 * Update). 201 for a new file, 200 with the same file for a retry. An
 * image or PDF of a document on a Project joins its Gallery.
 */
export async function POST(
  request: Request,
  context: DocumentContext,
): Promise<Response> {
  try {
    const session = await requireDocumentSession(request, { write: true });
    if (isResponse(session)) return session;
    const { type, id } = await documentParams(context);
    const body = parseOrThrow(
      AddConstructionProcurementDocumentFileRequestModel.safeParse(
        await request.json(),
      ),
    );
    const { file, created } = await documentThread.complete({
      viewer: session.access,
      type,
      documentId: id,
      key: body.key,
      fileName: body.fileName,
    });
    return Response.json(toDocumentFileResponse(file), {
      status: created ? StatusCodes.CREATED : StatusCodes.OK,
    });
  } catch (error) {
    return mapError(error);
  }
}
