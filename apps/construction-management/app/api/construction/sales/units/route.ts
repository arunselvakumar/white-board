import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { requestProjectId } from "@/app/api/construction/sales/project-scope";
import { requireSalesProjectAccess } from "@/app/api/construction/sales/sales-access";
import { unitSalesHandlers } from "@/src/composition/sales-bookings";
import { BOOKING_MENU } from "@/src/sales/application/sales-booking-deps";
import { can } from "@/src/shared-kernel/access";

import {
  GetConstructionSalesUnitChartRequestModel,
  toUnitChartResponse,
} from "./unit-models";

export const dynamic = "force-dynamic";

/**
 * The Units chart (CM-1005, ADR CM-0022 §8): every Wing of the Project
 * with its units counted by sales status — Available, On Hold, Booked,
 * Unavailable (a hold past its Hold until date counts Available) — and the
 * chosen Wing's floors × units grid. Needs Booking read on the Project.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const query = Object.fromEntries(new URL(request.url).searchParams);
    const session = await requireSalesProjectAccess(
      request,
      BOOKING_MENU,
      "read",
      requestProjectId(query),
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      GetConstructionSalesUnitChartRequestModel.safeParse(query),
    );
    const chart = await unitSalesHandlers.chart(
      session.access,
      model.projectId,
      model.wingId,
    );
    const scope = { projectId: model.projectId };
    return Response.json(
      toUnitChartResponse(model.projectId, chart, {
        update: can(session.access, BOOKING_MENU, "update", scope),
        create: can(session.access, BOOKING_MENU, "create", scope),
      }),
    );
  } catch (error) {
    return mapError(error);
  }
}
