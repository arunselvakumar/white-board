import { prisma } from "@repo/construction-db";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { requestProjectId } from "@/app/api/construction/sales/project-scope";
import { requireSalesProjectAccess } from "@/app/api/construction/sales/sales-access";
import { bookableUnits } from "@/src/composition/sales-bookings";
import { BOOKING_MENU } from "@/src/sales/application/sales-booking-deps";

import {
  GetConstructionSalesBookingFormOptionsRequestModel,
  toBookingFormOptions,
} from "../booking-models";

export const dynamic = "force-dynamic";

/**
 * The booking form's unit picker (CM-1006): each Wing with the units that
 * can be booked now — live, not Unavailable, no active booking (a hold
 * past its Hold until date does not count). Needs Booking create.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const query = Object.fromEntries(new URL(request.url).searchParams);
    const session = await requireSalesProjectAccess(
      request,
      BOOKING_MENU,
      "create",
      requestProjectId(query),
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      GetConstructionSalesBookingFormOptionsRequestModel.safeParse(query),
    );
    return Response.json(
      toBookingFormOptions(
        await bookableUnits(prisma, session.workspaceId, model.projectId),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
