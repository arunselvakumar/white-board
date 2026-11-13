import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { dashboardHandlers } from "@/src/composition/marketing-dashboard";
import { DASHBOARD_MENU } from "@/src/marketing/application/dashboard-handlers";

import {
  GetConstructionMarketingDashboardRequestModel,
  toDashboardResponse,
} from "./dashboard-models";

export const dynamic = "force-dynamic";

/**
 * The Marketing Dashboard for a period (ADR CM-0040 §13): the caller's own
 * figures, or with View all on the Dashboard the team's or one Marketing
 * Person's. Needs Dashboard read; each section also needs read on its own
 * menu and is null without it.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, DASHBOARD_MENU, "read");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      GetConstructionMarketingDashboardRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    return Response.json(
      toDashboardResponse(await dashboardHandlers.read(session.access, model)),
    );
  } catch (error) {
    return mapError(error);
  }
}
