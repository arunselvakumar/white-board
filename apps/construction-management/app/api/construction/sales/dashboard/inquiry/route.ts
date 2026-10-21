import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { requestProjectId } from "@/app/api/construction/sales/project-scope";
import { requireSalesProjectAccess } from "@/app/api/construction/sales/sales-access";
import { readInquiryDashboard } from "@/src/composition/sales-dashboard";
import { can } from "@/src/shared-kernel/access";

import {
  GetConstructionSalesInquiryDashboardRequestModel,
  toInquiryDashboardResponse,
} from "../inquiry-dashboard-models";

export const dynamic = "force-dynamic";

/**
 * The Project Dashboard's Inquiry section (CM-1008, ADR CM-0022 §11):
 * Total, Converted, Lost and Conv. Rate by Inquiry Date in the duration;
 * Open and Overdue now; the funnel; lead source and sales team
 * performance; Call Activity in its own period. Behind Dashboard Read on
 * the Project (404 for one that is not a live Project of the Company);
 * `inquiry` is null without Inquiry Read. Without View all it counts the
 * inquiries the caller created, is assigned to or owns as Lead Owner.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const query = Object.fromEntries(new URL(request.url).searchParams);
    const session = await requireSalesProjectAccess(
      request,
      "reporting.project_dashboard",
      "read",
      requestProjectId(query),
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      GetConstructionSalesInquiryDashboardRequestModel.safeParse(query),
    );
    if (
      !can(session.access, "sales.inquiries", "read", {
        projectId: model.projectId,
      })
    )
      return Response.json(toInquiryDashboardResponse(model.projectId, null));
    return Response.json(
      toInquiryDashboardResponse(
        model.projectId,
        await readInquiryDashboard(
          session.access,
          model.projectId,
          { from: model.from, to: model.to },
          model.period,
        ),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
