import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  GetConstructionSiteWorkDashboardRequestModel,
  toDailyWorkDashboardResponse,
} from "../dashboard-models";
import { DASHBOARD_MENU, siteWorkDashboard } from "../handlers";

export const dynamic = "force-dynamic";

/**
 * The Project Dashboard's Daily Work section (CM-608): worksheet labour
 * per day against attendance heads, contractor-wise labour and the KPI
 * figures, from live worksheets that are not rejected. Needs Dashboard
 * Read on the Project.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      GetConstructionSiteWorkDashboardRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const session = await requireAccess(request, DASHBOARD_MENU, "read", {
      projectId: model.projectId,
    });
    if (isResponse(session)) return session;
    const dashboard = await siteWorkDashboard.dailyWork(
      session.workspaceId,
      model.projectId,
      { from: model.from, to: model.to },
    );
    return Response.json(toDailyWorkDashboardResponse(dashboard));
  } catch (error) {
    return mapError(error);
  }
}
