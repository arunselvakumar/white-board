import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { ConstructionProjectsProjectParamsModel } from "../../../project-models";
import { projectDocuments } from "../handlers";
import {
  StartConstructionProjectsDocumentUploadRequestModel,
  type StartConstructionProjectsDocumentUploadResponseModel,
} from "../project-document-models";
import { documentsPath } from "../project-document-responses";

export const dynamic = "force-dynamic";

/**
 * Starts an upload (step 1, CM-414): checks the name, size, count and
 * plan, and says where the bytes go — straight to Vercel Blob, or through
 * `uploads/app` where storage is files on disk.
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
    const body = parseOrThrow(
      StartConstructionProjectsDocumentUploadRequestModel.safeParse(
        await request.json(),
      ),
    );
    const started = await projectDocuments.start({
      viewer: session.access,
      projectId: id,
      fileName: body.fileName,
      bytes: body.bytes,
    });
    const base = documentsPath(id);
    const response: StartConstructionProjectsDocumentUploadResponseModel = {
      key: started.key,
      fileName: started.fileName,
      upload:
        started.upload.via === "blob"
          ? {
              via: "blob",
              handleUploadUrl: `${base}/uploads/presign`,
              multipart: started.upload.multipart,
            }
          : {
              via: "app",
              url: `${base}/uploads/app?key=${encodeURIComponent(started.key)}`,
            },
    };
    return Response.json(response, { status: StatusCodes.CREATED });
  } catch (error) {
    return mapError(error);
  }
}
