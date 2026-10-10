import { mapError } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { projectHome } from "../handlers";
import { toDashboardLayoutResponse } from "./dashboard-layout-models";

export const dynamic = "force-dynamic";

/**
 * The caller's Project Dashboard layout (CM-412): every section in their
 * order; the default (all shown) until they save one. Needs the
 * Dashboard menu's Read flag.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "reporting.project_dashboard",
      "read",
    );
    if (isResponse(session)) return session;
    return Response.json(
      toDashboardLayoutResponse(
        await projectHome.dashboardLayout(session.access),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
