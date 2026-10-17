import { bookingHandlers } from "@/src/composition/sales-bookings";

import { UpdateConstructionSalesBookingRequestModel } from "../../booking-models";
import { bookingCommand } from "../../booking-route-parts";

export const dynamic = "force-dynamic";

/**
 * Edits an On Hold or Booked booking's details (CM-1006): the status,
 * unit and Hold until stay. Needs Booking update; 409 `BOOKING_CHANGED`
 * when stale, `BOOKING_CANCELLED` once cancelled. The back-dated window
 * applies to the old Booking Date and, when it changes, the new one.
 */
export const POST = bookingCommand(
  UpdateConstructionSalesBookingRequestModel,
  "update",
  (access, id, model) =>
    bookingHandlers.edit(access, id, new Date(model.expectedUpdatedAt), model),
);
