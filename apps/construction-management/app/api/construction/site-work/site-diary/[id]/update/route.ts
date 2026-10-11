import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { siteDiaryActions } from "@/src/site-work/application/site-diary-handlers";

import {
  requireSiteDiaryAccess,
  siteDiaryHandlers as handlers,
} from "../../handlers";
import {
  ConstructionSiteWorkSiteDiaryParamsModel,
  toSiteDiaryResponse,
  UpdateConstructionSiteWorkSiteDiaryRequestModel,
} from "../../site-diary-models";

export const dynamic = "force-dynamic";

/**
 * Edits a Site Diary; visitors and instructions are replaced as a set.
 * The back-dated edit limit applies to the old date and a new one. Needs
 * update on its Project; 409 `SITE_DIARY_CHANGED` when stale.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionSiteWorkSiteDiaryParamsModel.safeParse(await context.params),
    );
    const session = await requireSiteDiaryAccess(request, id, "update");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      UpdateConstructionSiteWorkSiteDiaryRequestModel.safeParse(
        await request.json(),
      ),
    );
    await handlers.edit(
      session.access,
      id,
      new Date(model.expectedUpdatedAt),
      model,
    );
    const diary = await handlers.get(session.workspaceId, id);
    return Response.json(
      toSiteDiaryResponse(diary, siteDiaryActions(session.access, diary)),
    );
  } catch (error) {
    return mapError(error);
  }
}
