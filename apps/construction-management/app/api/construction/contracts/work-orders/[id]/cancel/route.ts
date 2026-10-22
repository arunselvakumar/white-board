import { parseOrThrow } from "@/app/api/_lib/map-error";

import { workOrderHandlers } from "../../work-order-access";
import { CancelConstructionContractsWorkOrderRequestModel } from "../../work-order-models";
import { expected, workOrderRoute } from "../../work-order-route";

export const dynamic = "force-dynamic";

/**
 * Cancels a draft or issued Work Order with a reason (CM-1104; 409
 * WORK_ORDER_BILLED once an approved bill names a line, 409
 * WORK_ORDER_BILL_OPEN while a bill is open). Needs Work Order update.
 */
export const POST = workOrderRoute("update", async (session, id, request) => {
  const model = parseOrThrow(
    CancelConstructionContractsWorkOrderRequestModel.safeParse(
      await request.json(),
    ),
  );
  return workOrderHandlers.cancel(
    session.access,
    id,
    model.reason,
    expected(model.expectedUpdatedAt),
  );
});
