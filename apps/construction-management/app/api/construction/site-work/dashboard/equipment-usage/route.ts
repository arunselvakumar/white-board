import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { can } from "@/src/shared-kernel/access";

import {
  GetConstructionSiteWorkDashboardRequestModel,
  toEquipmentUsageDashboardResponse,
} from "../dashboard-models";
import { DASHBOARD_MENU, siteWorkDashboard } from "../handlers";

export const dynamic = "force-dynamic";

/**
 * The Project Dashboard's Equipment Usage section (CM-608): top hourly
 * equipment by work hours, owned against rented hours and the KPI
 * figures, from live usage sheets that are not rejected. Needs Dashboard
 * Read on the Project; the rented hire cost also needs Financial on
 * Equipment Usage there.
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
    const summary = await siteWorkDashboard.equipmentUsage(
      session.workspaceId,
      model.projectId,
      { from: model.from, to: model.to },
    );
    const financial = can(
      session.access,
      "site_work.equipment_usage",
      "financial",
      { projectId: model.projectId },
    );
    return Response.json(toEquipmentUsageDashboardResponse(summary, financial));
  } catch (error) {
    return mapError(error);
  }
}
