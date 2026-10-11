import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { siteDiaryActions } from "@/src/site-work/application/site-diary-handlers";

import {
  requireSiteDiaryAccess,
  siteDiaryHandlers as handlers,
} from "../handlers";
import {
  ConstructionSiteWorkSiteDiaryParamsModel,
  toSiteDiaryResponse,
} from "../site-diary-models";

export const dynamic = "force-dynamic";

/** One Site Diary with its visitors and instructions (read on its Project). */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionSiteWorkSiteDiaryParamsModel.safeParse(await context.params),
    );
    const session = await requireSiteDiaryAccess(request, id, "read");
    if (isResponse(session)) return session;
    const diary = await handlers.get(session.workspaceId, id);
    return Response.json(
      toSiteDiaryResponse(diary, siteDiaryActions(session.access, diary)),
    );
  } catch (error) {
    return mapError(error);
  }
}
