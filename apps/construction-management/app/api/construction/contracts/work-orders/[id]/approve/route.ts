import { parseOrThrow } from "@/app/api/_lib/map-error";

import { workOrderHandlers } from "../../work-order-access";
import { ConstructionContractsWorkOrderStepRequestModel } from "../../work-order-models";
import { expected, workOrderRoute } from "../../work-order-route";

export const dynamic = "force-dynamic";

/**
 * Approves a pending Work Order, which issues it (CM-1104; 409
 * WORK_ORDER_NOT_PENDING). Needs Work Order approve.
 */
export const POST = workOrderRoute("approve", async (session, id, request) => {
  const model = parseOrThrow(
    ConstructionContractsWorkOrderStepRequestModel.safeParse(
      await request.json(),
    ),
  );
  return workOrderHandlers.approve(
    session.access,
    id,
    expected(model.expectedUpdatedAt),
  );
});
