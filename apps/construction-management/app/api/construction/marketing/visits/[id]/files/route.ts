import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  CompleteConstructionMarketingVisitFileUploadRequestModel,
  toVisitFileResponse,
} from "../../file-models";
import { visitFiles, type VisitContext } from "../../file-routes";
import { VISITS_MENU } from "../../handlers";
import { ConstructionMarketingVisitParamsModel } from "../../visit-models";

export const dynamic = "force-dynamic";

/** A Visit's photos and files, oldest first. Needs Visits read. */
export async function GET(
  request: Request,
  context: VisitContext,
): Promise<Response> {
  try {
    const session = await requireAccess(request, VISITS_MENU, "read");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionMarketingVisitParamsModel.safeParse(await context.params),
    );
    const files = await visitFiles.files(session.access, id);
    return Response.json({ files: files.map(toVisitFileResponse) });
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Finishes an upload: checks what arrived and records it on the Visit
 * (201; 200 for a retry of the same key). Needs Visits update.
 */
export async function POST(
  request: Request,
  context: VisitContext,
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionMarketingVisitParamsModel.safeParse(await context.params),
    );
    const session = await requireAccess(request, VISITS_MENU, "update");
    if (isResponse(session)) return session;
    await visitFiles.assertCanUpload(session.access, id);
    const body = parseOrThrow(
      CompleteConstructionMarketingVisitFileUploadRequestModel.safeParse(
        await request.json(),
      ),
    );
    const { file, created } = await visitFiles.complete({
      access: session.access,
      visitId: id,
      key: body.key,
      fileName: body.fileName,
      caption: body.caption,
    });
    return Response.json(toVisitFileResponse(file), {
      status: created ? StatusCodes.CREATED : StatusCodes.OK,
    });
  } catch (error) {
    return mapError(error);
  }
}
