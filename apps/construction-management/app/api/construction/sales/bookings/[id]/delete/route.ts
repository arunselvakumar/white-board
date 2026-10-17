import { bookingHandlers } from "@/src/composition/sales-bookings";

import { DeleteConstructionSalesBookingRequestModel } from "../../booking-models";
import { bookingCommand } from "../../booking-route-parts";

export const dynamic = "force-dynamic";

/**
 * Deletes a booking entered by mistake (CM-0022 §7): a tombstone, audited;
 * the unit is free again. Needs Booking delete; the back-dated edit limit
 * applies to its Booking Date. 204.
 */
export const POST = bookingCommand(
  DeleteConstructionSalesBookingRequestModel,
  "delete",
  (access, id, model) =>
    bookingHandlers.delete(access, id, new Date(model.expectedUpdatedAt)),
  { answer: "none" },
);
