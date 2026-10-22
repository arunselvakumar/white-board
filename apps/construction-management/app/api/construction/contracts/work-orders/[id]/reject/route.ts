import { parseOrThrow } from "@/app/api/_lib/map-error";

import { workOrderHandlers } from "../../work-order-access";
import { RejectConstructionContractsWorkOrderRequestModel } from "../../work-order-models";
import { expected, workOrderRoute } from "../../work-order-route";

export const dynamic = "force-dynamic";

/**
 * Rejects a pending Work Order with a reason: it goes back to draft
 * (CM-1104; 400 REJECTION_REASON_REQUIRED, 409 WORK_ORDER_NOT_PENDING).
 * Needs Work Order reject.
 */
export const POST = workOrderRoute("reject", async (session, id, request) => {
  const model = parseOrThrow(
    RejectConstructionContractsWorkOrderRequestModel.safeParse(
      await request.json(),
    ),
  );
  return workOrderHandlers.reject(
    session.access,
    id,
    model.reason,
    expected(model.expectedUpdatedAt),
  );
});
