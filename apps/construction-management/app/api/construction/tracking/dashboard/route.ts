import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { projectDashboardKpis } from "@/src/composition/dashboard-reads";
import { createTrackingDashboard } from "@/src/composition/tracking-dashboard";

import { requestProjectId } from "../project-scope";
import {
  GetConstructionTrackingDashboardRequestModel,
  toTrackingDashboardResponse,
} from "./dashboard-models";

export const dynamic = "force-dynamic";

const dashboard = createTrackingDashboard();
const kpis = projectDashboardKpis();

/**
 * The Project Dashboard's Task, Issue & Snag and Inspection Request
 * sections and the Pending Issues & Snags and Pending Inspections tiles
 * (CM-805, ADR CM-0019 §14), behind Dashboard Read on the Project (ADR
 * CM-0013 §12). Each section also needs its menu's Read on the Project
 * (null without it); Value Earned By Task needs Task Financial. The two
 * tiles read `construction_reporting.project_pending_tracking` (CM-902).
 */
export async function GET(request: Request): Promise<Response> {
  try {
    // The Project first, for the access check; the rest of the query is
    // validated only for a caller who may read it.
    const query = Object.fromEntries(new URL(request.url).searchParams);
    const session = await requireAccess(
      request,
      "reporting.project_dashboard",
      "read",
      { projectId: requestProjectId(query) },
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      GetConstructionTrackingDashboardRequestModel.safeParse(query),
    );
    const range = { from: model.from, to: model.to };
    const [result, tiles] = await Promise.all([
      dashboard.read(session.access, model.projectId, range),
      kpis.trackingKpis(session.access, model.projectId, range),
    ]);
    return Response.json(toTrackingDashboardResponse(result, tiles));
  } catch (error) {
    return mapError(error);
  }
}
