import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { companyDashboardReader } from "@/src/composition/dashboard-reads";

import {
  GetConstructionReportingCompanyDashboardRequestModel,
  toCompanyDashboardResponse,
} from "./company-dashboard-models";

export const dynamic = "force-dynamic";

const reader = companyDashboardReader();

/**
 * The Company Dashboard (CM-902, ADR CM-0021 §4), behind Dashboard Read
 * (`reporting.project_dashboard`). Totals and one row per Project the
 * caller can see — every Project for the Owner, the assigned ones for a
 * Member — read from the `construction_reporting` views. Each figure
 * follows the Project Dashboard's permission on that Project.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "reporting.project_dashboard",
      "read",
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      GetConstructionReportingCompanyDashboardRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const range =
      model.from == null || model.to == null
        ? null
        : { from: model.from, to: model.to };
    return Response.json(
      toCompanyDashboardResponse(await reader.read(session.access, range)),
    );
  } catch (error) {
    return mapError(error);
  }
}
