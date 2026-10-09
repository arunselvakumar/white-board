import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { projectDocuments } from "../../handlers";
import { ConstructionProjectsDocumentParamsModel } from "../../project-document-models";

export const dynamic = "force-dynamic";

/** Deletes one of the Project's documents (CM-414): a tombstone, then the file goes. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; docId: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, "projects.project", "update");
    if (isResponse(session)) return session;
    const { id, docId } = parseOrThrow(
      ConstructionProjectsDocumentParamsModel.safeParse(await context.params),
    );
    await projectDocuments.delete({
      viewer: session.access,
      projectId: id,
      documentId: docId,
      by: session.userId,
    });
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
