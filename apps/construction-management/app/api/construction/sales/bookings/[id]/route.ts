import { mapError } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  bookingBody,
  bookingId,
  requireBookingAccess,
  type BookingContext,
} from "../booking-route-parts";

export const dynamic = "force-dynamic";

/** One booking with its status history (CM-1006). Needs Booking read on its Project. */
export async function GET(
  request: Request,
  context: BookingContext,
): Promise<Response> {
  try {
    const id = await bookingId(context);
    const session = await requireBookingAccess(request, id, "read");
    if (isResponse(session)) return session;
    return Response.json(await bookingBody(session.access, id));
  } catch (error) {
    return mapError(error);
  }
}
