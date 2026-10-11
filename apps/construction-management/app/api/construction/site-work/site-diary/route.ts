import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { siteDiaryActions } from "@/src/site-work/application/site-diary-handlers";

import { SITE_DIARY_MENU, siteDiaryHandlers as handlers } from "./handlers";
import {
  CreateConstructionSiteWorkSiteDiaryRequestModel,
  ListConstructionSiteWorkSiteDiariesRequestModel,
  toSiteDiaryDays,
  toSiteDiaryResponse,
} from "./site-diary-models";

export const dynamic = "force-dynamic";

/**
 * The dates in `from`–`to` (at most a year) that have a Site Diary on the
 * Project, newest first, with their weather and row counts (CM-607). Needs
 * Site Diary read on the Project.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const model = parseOrThrow(
      ListConstructionSiteWorkSiteDiariesRequestModel.safeParse(
        Object.fromEntries(url.searchParams),
      ),
    );
    const session = await requireAccess(request, SITE_DIARY_MENU, "read", {
      projectId: model.projectId,
    });
    if (isResponse(session)) return session;
    const days = await handlers.days(
      session.workspaceId,
      model.projectId,
      model.from,
      model.to,
    );
    return Response.json(toSiteDiaryDays(days));
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Writes the Project's Site Diary for a date (CM-607): one per date (409
 * `SITE_DIARY_EXISTS`), the date not after today and within the
 * back-dated limit. Needs Site Diary create on the Project.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      CreateConstructionSiteWorkSiteDiaryRequestModel.safeParse(
        await request.json(),
      ),
    );
    const session = await requireAccess(request, SITE_DIARY_MENU, "create", {
      projectId: model.projectId,
    });
    if (isResponse(session)) return session;
    const id = await handlers.create(session.access, model);
    const diary = await handlers.get(session.workspaceId, id);
    return Response.json(
      toSiteDiaryResponse(diary, siteDiaryActions(session.access, diary)),
      { status: StatusCodes.CREATED },
    );
  } catch (error) {
    return mapError(error);
  }
}
