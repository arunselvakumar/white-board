import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  AddConstructionSalesDocumentFileRequestModel,
  toSalesFileResponse,
  type ListConstructionSalesDocumentFilesResponse,
} from "../../../document-models";
import {
  requireSalesDocumentSession,
  salesDocumentParams,
  salesFiles,
  type SalesDocumentContext,
} from "../../../handlers";

export const dynamic = "force-dynamic";

/**
 * An inquiry's or booking's live files with their roles, oldest first
 * (Read on its menu; an inquiry outside View all is 404).
 */
export async function GET(
  request: Request,
  context: SalesDocumentContext,
): Promise<Response> {
  try {
    const session = await requireSalesDocumentSession(request, {
      write: false,
    });
    if (isResponse(session)) return session;
    const { type, id } = await salesDocumentParams(context);
    const { files, rights } = await salesFiles.files(session.access, type, id);
    const body: ListConstructionSalesDocumentFilesResponse = {
      items: files.map(toSalesFileResponse),
      canUpload: rights.upload,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Finishes an upload (step 3): records the file now at `key` with its
 * role. 201 for a new file, 200 for a retry. Never joins the Gallery.
 */
export async function POST(
  request: Request,
  context: SalesDocumentContext,
): Promise<Response> {
  try {
    const session = await requireSalesDocumentSession(request, {
      write: true,
    });
    if (isResponse(session)) return session;
    const { type, id } = await salesDocumentParams(context);
    const body = parseOrThrow(
      AddConstructionSalesDocumentFileRequestModel.safeParse(
        await request.json(),
      ),
    );
    const { file, created } = await salesFiles.complete({
      viewer: session.access,
      type,
      documentId: id,
      role: body.role,
      key: body.key,
      fileName: body.fileName,
    });
    return Response.json(toSalesFileResponse(file), {
      status: created ? StatusCodes.CREATED : StatusCodes.OK,
    });
  } catch (error) {
    return mapError(error);
  }
}
