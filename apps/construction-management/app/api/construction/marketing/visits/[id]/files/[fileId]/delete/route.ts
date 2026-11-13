import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { ConstructionMarketingVisitFileParamsModel } from "../../../../file-models";
import { visitFiles } from "../../../../file-routes";
import { VISITS_MENU } from "../../../../handlers";

export const dynamic = "force-dynamic";

/**
 * Removes a file (a tombstone, then the object): its uploader, or someone
 * with View all, with Visits update.
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
    await visitFiles.remove({ access: session.access, visitId: id, fileId });
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
