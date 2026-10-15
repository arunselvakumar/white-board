import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  AddConstructionTrackingDocumentFileRequestModel,
  type ListConstructionTrackingDocumentFilesResponseModel,
} from "../../../document-models";
import { toTrackingFileResponse } from "../../../document-responses";
import {
  requireTrackingDocumentSession,
  trackingDocumentParams,
  trackingFiles,
  type TrackingDocumentContext,
} from "../../../handlers";

export const dynamic = "force-dynamic";

/**
 * The document's live files, oldest first, with the bytes they take (Read
 * on its menu). Files posted with an entry carry its `entryId`.
 */
export async function GET(
  request: Request,
  context: TrackingDocumentContext,
): Promise<Response> {
  try {
    const session = await requireTrackingDocumentSession(request, {
      write: false,
    });
    if (isResponse(session)) return session;
    const { type, id } = await trackingDocumentParams(context);
    const { files, rights } = await trackingFiles.files(
      session.access,
      type,
      id,
    );
    const body: ListConstructionTrackingDocumentFilesResponseModel = {
      items: files.map(toTrackingFileResponse),
      totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
      canUpload: rights.upload,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Finishes an upload (step 3): records the file now at `key`. 201 for a
 * new file, 200 with the same file for a retry. An image or a PDF joins
 * the Project's Gallery.
 */
export async function POST(
  request: Request,
  context: TrackingDocumentContext,
): Promise<Response> {
  try {
    const session = await requireTrackingDocumentSession(request, {
      write: true,
    });
    if (isResponse(session)) return session;
    const { type, id } = await trackingDocumentParams(context);
    const body = parseOrThrow(
      AddConstructionTrackingDocumentFileRequestModel.safeParse(
        await request.json(),
      ),
    );
    const { file, created } = await trackingFiles.complete({
      viewer: session.access,
      type,
      documentId: id,
      key: body.key,
      fileName: body.fileName,
    });
    return Response.json(toTrackingFileResponse(file), {
      status: created ? StatusCodes.CREATED : StatusCodes.OK,
    });
  } catch (error) {
    return mapError(error);
  }
}
