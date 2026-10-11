import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  requireSiteDiaryAccess,
  siteDiaryHandlers as handlers,
} from "../../handlers";
import {
  ConstructionSiteWorkSiteDiaryParamsModel,
  DeleteConstructionSiteWorkSiteDiaryRequestModel,
} from "../../site-diary-models";

export const dynamic = "force-dynamic";

/**
 * Deletes a Site Diary (a tombstone); the date is free for a new one.
 * Needs delete on its Project; the back-dated edit limit applies.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionSiteWorkSiteDiaryParamsModel.safeParse(await context.params),
    );
    const session = await requireSiteDiaryAccess(request, id, "delete");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      DeleteConstructionSiteWorkSiteDiaryRequestModel.safeParse(
        await request.json(),
      ),
    );
    await handlers.delete(
      session.access,
      id,
      new Date(model.expectedUpdatedAt),
    );
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
