import { parseOrThrow } from "@/app/api/_lib/map-error";

import { workOrderHandlers } from "../../work-order-access";
import { CloseConstructionContractsWorkOrderRequestModel } from "../../work-order-models";
import { expected, workOrderRoute } from "../../work-order-route";

export const dynamic = "force-dynamic";

/**
 * Closes an issued Work Order with a date and reason (CM-1104; 409
 * WORK_ORDER_BILL_OPEN while a bill on it is draft or pending). Needs Work
 * Order update.
 */
export const POST = workOrderRoute("update", async (session, id, request) => {
  const model = parseOrThrow(
    CloseConstructionContractsWorkOrderRequestModel.safeParse(
      await request.json(),
    ),
  );
  return workOrderHandlers.close(
    session.access,
    id,
    { closedOn: model.closedOn, reason: model.reason },
    expected(model.expectedUpdatedAt),
  );
});
