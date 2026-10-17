import { unitSalesHandlers } from "@/src/composition/sales-bookings";

import { MarkConstructionSalesUnitAvailableRequestModel } from "../../unit-models";
import { expected, unitCommand } from "../../unit-route-parts";

export const dynamic = "force-dynamic";

/** Makes an unavailable unit available for sale again (CM-0022 §8). Needs Booking update. */
export const POST = unitCommand(
  MarkConstructionSalesUnitAvailableRequestModel,
  (access, unitId, model) =>
    unitSalesHandlers.markAvailable(
      access,
      model.projectId,
      unitId,
      expected(model.expectedUpdatedAt),
    ),
);
