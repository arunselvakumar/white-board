import { bookingHandlers } from "@/src/composition/sales-bookings";

import { ConfirmConstructionSalesBookingRequestModel } from "../../booking-models";
import { bookingCommand } from "../../booking-route-parts";

export const dynamic = "force-dynamic";

/**
 * **Confirm** a hold (CM-0022 §7): On Hold → Booked on a date, kept in the
 * history. Needs Booking update; 409 `BOOKING_NOT_ON_HOLD` otherwise.
 */
export const POST = bookingCommand(
  ConfirmConstructionSalesBookingRequestModel,
  "update",
  (access, id, model) =>
    bookingHandlers.confirm(
      access,
      id,
      new Date(model.expectedUpdatedAt),
      model.confirmedOn,
    ),
);
