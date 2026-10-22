import { parseOrThrow } from "@/app/api/_lib/map-error";

import { workOrderHandlers } from "../../work-order-access";
import { AmendConstructionContractsWorkOrderRequestModel } from "../../work-order-models";
import { workOrderRoute } from "../../work-order-route";

export const dynamic = "force-dynamic";

/**
 * Amends an issued Work Order with a reason (CM-1104): the current terms
 * and lines are kept as a revision and `revision` goes up; no second
 * approval. A line on an approved bill cannot be removed (409
 * WORK_ORDER_LINE_BILLED) or cut below what was billed (409
 * WORK_ORDER_QUANTITY_BELOW_BILLED). Needs Work Order update and approve.
 */
export const POST = workOrderRoute("update", async (session, id, request) => {
  const { expectedUpdatedAt, reason, ...input } = parseOrThrow(
    AmendConstructionContractsWorkOrderRequestModel.safeParse(
      await request.json(),
    ),
  );
  return workOrderHandlers.amend(
    session.access,
    id,
    new Date(expectedUpdatedAt),
    reason,
    input,
  );
});
