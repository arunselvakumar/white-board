import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  ConstructionMarketingVisitFileParamsModel,
  UpdateConstructionMarketingVisitFileRequestModel,
  toVisitFileResponse,
} from "../../../../file-models";
import { visitFiles } from "../../../../file-routes";
import { VISITS_MENU } from "../../../../handlers";

export const dynamic = "force-dynamic";

/**
 * Sets a file's caption: its uploader, or someone with View all, with
 * Visits update.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; fileId: string }> },
): Promise<Response> {
  try {
    const { id, fileId } = parseOrThrow(
      ConstructionMarketingVisitFileParamsModel.safeParse(await context.params),
    );
    const session = await requireAccess(request, VISITS_MENU, "update");
    if (isResponse(session)) return session;
    const body = parseOrThrow(
      UpdateConstructionMarketingVisitFileRequestModel.safeParse(
        await request.json(),
      ),
    );
    return Response.json(
      toVisitFileResponse(
        await visitFiles.setCaption({
          access: session.access,
          visitId: id,
          fileId,
          caption: body.caption,
        }),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
