import { parseOrThrow } from "@/app/api/_lib/map-error";

import { workOrderHandlers } from "../../work-order-access";
import { UpdateConstructionContractsWorkOrderRequestModel } from "../../work-order-models";
import { workOrderRoute } from "../../work-order-route";

export const dynamic = "force-dynamic";

/**
 * Saves a draft Work Order (CM-1104): lines sent with an `id` are kept,
 * the others removed. 409 WORK_ORDER_STATUS_INVALID once submitted, 409
 * WORK_ORDER_CHANGED when stale. Needs Work Order update, or create for
 * its creator.
 */
export const POST = workOrderRoute(
  ["create", "update"],
  async (session, id, request) => {
    const { expectedUpdatedAt, ...input } = parseOrThrow(
      UpdateConstructionContractsWorkOrderRequestModel.safeParse(
        await request.json(),
      ),
    );
    return workOrderHandlers.update(
      session.access,
      id,
      new Date(expectedUpdatedAt),
      input,
    );
  },
);
