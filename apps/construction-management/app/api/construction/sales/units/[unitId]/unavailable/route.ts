import { unitSalesHandlers } from "@/src/composition/sales-bookings";

import { MarkConstructionSalesUnitUnavailableRequestModel } from "../../unit-models";
import { expected, unitCommand } from "../../unit-route-parts";

export const dynamic = "force-dynamic";

/**
 * Marks a unit not for sale with a reason — Landowner share, Reserved,
 * Not for sale, Other — and a note (CM-0022 §8). Needs Booking update; 409
 * `UNIT_HAS_BOOKING` while a booking holds it (a hold past its Hold until
 * date is cancelled instead, "Hold expired").
 */
export const POST = unitCommand(
  MarkConstructionSalesUnitUnavailableRequestModel,
  (access, unitId, model) =>
    unitSalesHandlers.markUnavailable(
      access,
      model.projectId,
      unitId,
      expected(model.expectedUpdatedAt),
      model,
    ),
);
