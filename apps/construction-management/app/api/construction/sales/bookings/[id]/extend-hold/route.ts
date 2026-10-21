import { bookingHandlers } from "@/src/composition/sales-bookings";

import { ExtendConstructionSalesBookingHoldRequestModel } from "../../booking-models";
import { bookingCommand } from "../../booking-route-parts";

export const dynamic = "force-dynamic";

/**
 * **Extend hold** (CM-0022 §7): a new Hold until, today or later — an
 * expired hold included, while nobody booked the unit. Needs Booking
 * update; 409 `BOOKING_NOT_ON_HOLD` otherwise.
 */
export const POST = bookingCommand(
  ExtendConstructionSalesBookingHoldRequestModel,
  "update",
  (access, id, model) =>
    bookingHandlers.extendHold(
      access,
      id,
      new Date(model.expectedUpdatedAt),
      model.holdUntil,
    ),
);
