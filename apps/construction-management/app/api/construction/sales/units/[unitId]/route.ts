import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { requestProjectId } from "@/app/api/construction/sales/project-scope";
import { requireSalesProjectAccess } from "@/app/api/construction/sales/sales-access";
import { BOOKING_MENU } from "@/src/sales/application/sales-booking-deps";

import {
  ConstructionSalesUnitParamsModel,
  GetConstructionSalesUnitRequestModel,
} from "../unit-models";
import { unitBody, type UnitContext } from "../unit-route-parts";

export const dynamic = "force-dynamic";

/**
 * One unit's sales details (CM-1005): Unit type, areas, Unavailable, its
 * sales status, active booking and every live booking it had, with what
 * the viewer may do. Needs Booking read on the Project; 404
 * `UNIT_NOT_FOUND` for a unit that is not a live unit of it.
 */
export async function GET(
  request: Request,
  context: UnitContext,
): Promise<Response> {
  try {
    const { unitId } = parseOrThrow(
      ConstructionSalesUnitParamsModel.safeParse(await context.params),
    );
    const query = Object.fromEntries(new URL(request.url).searchParams);
    const session = await requireSalesProjectAccess(
      request,
      BOOKING_MENU,
      "read",
      requestProjectId(query),
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      GetConstructionSalesUnitRequestModel.safeParse(query),
    );
    return Response.json(
      await unitBody(session.access, model.projectId, unitId),
    );
  } catch (error) {
    return mapError(error);
  }
}
