import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  AddConstructionFinanceRemarkRequestModel,
  type ListConstructionFinanceRemarksResponseModel,
} from "../../../document-models";
import { toRemarkResponse } from "../../../document-responses";
import {
  documentParams,
  documentThread,
  requireDocumentSession,
  type DocumentContext,
} from "../../../handlers";

export const dynamic = "force-dynamic";

/**
 * The document's remarks, oldest first, each with its author and files.
 * Read on the document's menu, on its Project.
 */
export async function GET(
  request: Request,
  context: DocumentContext,
): Promise<Response> {
  try {
    const session = await requireDocumentSession(request, { write: false });
    if (isResponse(session)) return session;
    const { type, id } = await documentParams(context);
    const { remarks, rights } = await documentThread.thread(
      session.access,
      type,
      id,
    );
    const body: ListConstructionFinanceRemarksResponseModel = {
      items: remarks.map(toRemarkResponse),
      canComment: rights.comment,
      canAttach: rights.upload,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Posts a remark, optionally with files the caller already uploaded to the
 * document. Read on the document's menu is enough: anyone who sees the
 * document can comment. Remarks are never edited or deleted.
 */
export async function POST(
  request: Request,
  context: DocumentContext,
): Promise<Response> {
  try {
    const session = await requireDocumentSession(request, { write: true });
    if (isResponse(session)) return session;
    const { type, id } = await documentParams(context);
    const model = parseOrThrow(
      AddConstructionFinanceRemarkRequestModel.safeParse(await request.json()),
    );
    const remark = await documentThread.addRemark({
      viewer: session.access,
      type,
      documentId: id,
      body: model.body,
      fileIds: model.fileIds,
    });
    return Response.json(toRemarkResponse(remark), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
