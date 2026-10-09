import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { readUpload } from "@/app/api/_lib/uploads";
import { PROJECT_DOCUMENT_MAX_BYTES } from "@/src/projects/domain/project-document-rules";

import { ConstructionProjectsProjectParamsModel } from "../../../../project-models";
import { projectDocuments } from "../../handlers";
import { ReceiveConstructionProjectsDocumentUploadQueryModel } from "../../project-document-responses";

export const dynamic = "force-dynamic";

/**
 * Step 2 in development and tests (CM-414): the raw file as the body, kept
 * at `?key=` on disk. 404 when deployed, where browsers upload straight to
 * Vercel Blob.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, "projects.project", "update");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionProjectsProjectParamsModel.safeParse(await context.params),
    );
    const { key } = parseOrThrow(
      ReceiveConstructionProjectsDocumentUploadQueryModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const upload = await readUpload(request, PROJECT_DOCUMENT_MAX_BYTES);
    await projectDocuments.receive({
      viewer: session.access,
      projectId: id,
      key,
      bytes: upload.bytes,
    });
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
