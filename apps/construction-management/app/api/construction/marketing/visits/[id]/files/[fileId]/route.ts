import { storedFileResponse } from "@/app/api/_lib/attachments";
import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  ConstructionMarketingVisitFileParamsModel,
  GetConstructionMarketingVisitFileQueryModel,
} from "../../../file-models";
import { visitFiles } from "../../../file-routes";
import { VISITS_MENU } from "../../../handlers";

export const dynamic = "force-dynamic";

/**
 * Streams one file to anyone who may see the Visit (ADR CM-0040 §5), never
 * cached; a PDF or an image is shown, `?download=1` saves it.
 */
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
    const query = parseOrThrow(
      GetConstructionMarketingVisitFileQueryModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const { file, object } = await visitFiles.read(session.access, id, fileId);
    return storedFileResponse(
      {
        contentType: file.contentType,
        fileName: file.fileName,
        viewable: file.viewable,
      },
      object,
      query.download === "1",
    );
  } catch (error) {
    return mapError(error);
  }
}
