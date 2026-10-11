import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { siteDiaryActions } from "@/src/site-work/application/site-diary-handlers";

import { SITE_DIARY_MENU, siteDiaryHandlers as handlers } from "../handlers";
import {
  GetConstructionSiteWorkSiteDiaryByDateRequestModel,
  toSiteDiaryResponse,
  type GetConstructionSiteWorkSiteDiaryByDateResponse,
} from "../site-diary-models";

export const dynamic = "force-dynamic";

/** The Project's Site Diary for a date, or `diary: null` (read on the Project). */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const model = parseOrThrow(
      GetConstructionSiteWorkSiteDiaryByDateRequestModel.safeParse(
        Object.fromEntries(url.searchParams),
      ),
    );
    const session = await requireAccess(request, SITE_DIARY_MENU, "read", {
      projectId: model.projectId,
    });
    if (isResponse(session)) return session;
    const diary = await handlers.onDate(
      session.workspaceId,
      model.projectId,
      model.date,
    );
    const body: GetConstructionSiteWorkSiteDiaryByDateResponse = {
      date: model.date,
      diary:
        diary == null
          ? null
          : toSiteDiaryResponse(diary, siteDiaryActions(session.access, diary)),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
