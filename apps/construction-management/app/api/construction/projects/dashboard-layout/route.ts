import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { projectHome } from "../handlers";
import {
  GetConstructionProjectsDashboardLayoutRequestModel,
  toDashboardLayoutResponse,
} from "./dashboard-layout-models";

export const dynamic = "force-dynamic";

/**
 * The caller's Project Dashboard layout (CM-412): every section in their
 * order; the default (all shown) until they save one. Needs the
 * Dashboard menu's Read flag. With `projectId` (Dashboard Read on that
 * Project; 404 for one the caller is not on) the sections whose module is
 * hidden there are marked, and the dashboard leaves them out (CM-902).
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const { projectId } = parseOrThrow(
      GetConstructionProjectsDashboardLayoutRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const session = await requireAccess(
      request,
      "reporting.project_dashboard",
      "read",
      projectId == null ? {} : { projectId },
    );
    if (isResponse(session)) return session;
    const [sections, hidden] = await Promise.all([
      projectHome.dashboardLayout(session.access),
      projectId == null
        ? undefined
        : projectHome.dashboardSectionsHidden(session.access, projectId),
    ]);
    return Response.json(toDashboardLayoutResponse(sections, hidden));
  } catch (error) {
    return mapError(error);
  }
}
