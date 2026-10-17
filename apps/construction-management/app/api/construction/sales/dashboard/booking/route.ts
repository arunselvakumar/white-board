import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { requestProjectId } from "@/app/api/construction/sales/project-scope";
import { requireSalesProjectAccess } from "@/app/api/construction/sales/sales-access";
import {
  bookingHandlers,
  unitSalesHandlers,
} from "@/src/composition/sales-bookings";
import { BOOKING_MENU } from "@/src/sales/application/sales-booking-deps";
import { can } from "@/src/shared-kernel/access";

import {
  GetConstructionSalesBookingDashboardRequestModel,
  toBookingDashboardResponse,
} from "../booking-dashboard-models";

export const dynamic = "force-dynamic";

/**
 * The Project Dashboard's Booking section (CM-1008, ADR CM-0022 §11): the
 * Project's units by sales status, the same per Wing, and the five latest
 * bookings — as on the Company's today, whatever the dashboard duration.
 * Behind Dashboard Read on the Project (404 for one that is not a live
 * Project of the Company); `booking` is null without Booking Read. The
 * figures are the Units chart's.
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
      GetConstructionSalesBookingDashboardRequestModel.safeParse(query),
    );
    if (
      !can(session.access, BOOKING_MENU, "read", {
        projectId: model.projectId,
      })
    )
      return Response.json(toBookingDashboardResponse(model.projectId, null));
    const [chart, latest] = await Promise.all([
      unitSalesHandlers.chart(session.access, model.projectId),
      bookingHandlers.list(session.access, {
        projectId: model.projectId,
        limit: 5,
      }),
    ]);
    return Response.json(
      toBookingDashboardResponse(model.projectId, {
        chart,
        latest: latest.items,
      }),
    );
  } catch (error) {
    return mapError(error);
  }
}
