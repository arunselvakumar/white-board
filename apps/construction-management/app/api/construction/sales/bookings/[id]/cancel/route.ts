import { bookingHandlers } from "@/src/composition/sales-bookings";

import { CancelConstructionSalesBookingRequestModel } from "../../booking-models";
import { bookingCommand } from "../../booking-route-parts";

export const dynamic = "force-dynamic";

/**
 * **Cancel** a booking (CM-0022 §7) with a reason (≤ 500) and a date; the
 * unit is free again. Needs Booking update; 409 `BOOKING_CANCELLED` when
 * it already is.
 */
export const POST = bookingCommand(
  CancelConstructionSalesBookingRequestModel,
  "update",
  (access, id, model) =>
    bookingHandlers.cancel(
      access,
      id,
      new Date(model.expectedUpdatedAt),
      model,
    ),
);
