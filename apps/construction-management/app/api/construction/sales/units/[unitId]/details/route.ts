import { unitSalesHandlers } from "@/src/composition/sales-bookings";

import { SetConstructionSalesUnitDetailsRequestModel } from "../../unit-models";
import { expected, unitCommand } from "../../unit-route-parts";

export const dynamic = "force-dynamic";

/**
 * Sets a unit's Unit type, Carpet / Built-up / Super built-up area and
 * area unit (CM-1005, ADR CM-0022 §8). Needs Booking update; 409
 * `UNIT_PROFILE_CHANGED` when `expectedUpdatedAt` is stale.
 */
export const POST = unitCommand(
  SetConstructionSalesUnitDetailsRequestModel,
  (access, unitId, model) =>
    unitSalesHandlers.setDetails(
      access,
      model.projectId,
      unitId,
      expected(model.expectedUpdatedAt),
      model,
    ),
);
