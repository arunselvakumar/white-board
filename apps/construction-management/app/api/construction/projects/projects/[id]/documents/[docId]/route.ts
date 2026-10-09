import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { projectDocuments } from "../handlers";
import { ConstructionProjectsDocumentParamsModel } from "../project-document-models";
import {
  GetConstructionProjectsDocumentQueryModel,
  projectDocumentResponse,
} from "../project-document-responses";

export const dynamic = "force-dynamic";

/**
 * Streams one of the Project's documents (CM-414): a PDF or an image is
 * shown, anything else downloads; `?download=1` always downloads.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; docId: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, "projects.project", "read");
    if (isResponse(session)) return session;
    const { id, docId } = parseOrThrow(
      ConstructionProjectsDocumentParamsModel.safeParse(await context.params),
    );
    const query = parseOrThrow(
      GetConstructionProjectsDocumentQueryModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const { document, object } = await projectDocuments.read(
      session.access,
      id,
      docId,
    );
    return projectDocumentResponse(document, object, query.download === "1");
  } catch (error) {
    return mapError(error);
  }
}
