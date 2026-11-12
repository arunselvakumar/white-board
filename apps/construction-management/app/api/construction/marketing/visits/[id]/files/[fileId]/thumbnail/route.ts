import { thumbnailResponse } from "@/app/api/_lib/attachments";
import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { ConstructionMarketingVisitFileParamsModel } from "../../../../file-models";
import { visitFiles } from "../../../../file-routes";
import { VISITS_MENU } from "../../../../handlers";

export const dynamic = "force-dynamic";

/** An image's WebP thumbnail; 404 `THUMBNAIL_NOT_FOUND` without one. */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; fileId: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, VISITS_MENU, "read");
    if (isResponse(session)) return session;
    const { id, fileId } = parseOrThrow(
      ConstructionMarketingVisitFileParamsModel.safeParse(await context.params),
    );
    return thumbnailResponse(
      await visitFiles.readThumbnail(session.access, id, fileId),
    );
  } catch (error) {
    return mapError(error);
  }
}
