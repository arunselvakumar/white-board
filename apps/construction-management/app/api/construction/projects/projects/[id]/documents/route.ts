import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { ConstructionProjectsProjectParamsModel } from "../../project-models";
import { projectDocuments } from "./handlers";
import { AddConstructionProjectsDocumentRequestModel } from "./project-document-models";
import { toProjectDocumentResponse } from "./project-document-responses";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** The Project's documents, newest first, with the bytes they take (CM-414). */
export async function GET(
  request: Request,
  context: Context,
): Promise<Response> {
  try {
    const session = await requireAccess(request, "projects.project", "read");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionProjectsProjectParamsModel.safeParse(await context.params),
    );
    const { items, totalBytes } = await projectDocuments.list(
      session.access,
      id,
    );
    return Response.json({
      items: items.map(toProjectDocumentResponse),
      totalBytes,
    });
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Finishes an upload (step 3): records the file now at `key`. 201 for a
 * new document, 200 with the same document when it was already recorded
 * (a retry).
 */
export async function POST(
  request: Request,
  context: Context,
): Promise<Response> {
  try {
    const session = await requireAccess(request, "projects.project", "update");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionProjectsProjectParamsModel.safeParse(await context.params),
    );
    const body = parseOrThrow(
      AddConstructionProjectsDocumentRequestModel.safeParse(
        await request.json(),
      ),
    );
    const { document, created } = await projectDocuments.complete({
      viewer: session.access,
      projectId: id,
      key: body.key,
      kind: body.kind,
      fileName: body.fileName,
      by: session.userId,
    });
    return Response.json(toProjectDocumentResponse(document), {
      status: created ? StatusCodes.CREATED : StatusCodes.OK,
    });
  } catch (error) {
    return mapError(error);
  }
}
