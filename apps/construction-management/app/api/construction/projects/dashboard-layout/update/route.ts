import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { projectHome } from "../../handlers";
import {
  UpdateConstructionProjectsDashboardLayoutRequestModel,
  toDashboardLayoutResponse,
} from "../dashboard-layout-models";

export const dynamic = "force-dynamic";

/**
 * Manage Dashboard (CM-412): the caller's sections in order with what
 * shows, for every Project. A preference, so the Dashboard menu's Read
 * flag is enough.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "reporting.project_dashboard",
      "read",
    );
    if (isResponse(session)) return session;
    const body = parseOrThrow(
      UpdateConstructionProjectsDashboardLayoutRequestModel.safeParse(
        await request.json(),
      ),
    );
    return Response.json(
      toDashboardLayoutResponse(
        await projectHome.setDashboardLayout({
          viewer: session.access,
          sections: body.sections,
        }),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
