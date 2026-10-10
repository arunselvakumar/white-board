import { mapError } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { createDashboardQueries } from "@/src/hrms/infrastructure/create-dashboard-queries";

import { toDashboardResponse } from "./dashboard-models";

export const dynamic = "force-dynamic";

const dashboard = createDashboardQueries();

/**
 * The HRMS Dashboard (CM-319): today's snapshot, breakdown and trend,
 * pending approvals, upcoming leave and holidays, and the caller's own day.
 * Needs `hrms.hrms` read; each section needs its own flag.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, "hrms.hrms", "read");
    if (isResponse(session)) return session;
    return Response.json(
      toDashboardResponse(await dashboard.dashboard(session.access)),
    );
  } catch (error) {
    return mapError(error);
  }
}
