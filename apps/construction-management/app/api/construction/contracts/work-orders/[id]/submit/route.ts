import { parseOrThrow } from "@/app/api/_lib/map-error";

import { workOrderHandlers } from "../../work-order-access";
import { ConstructionContractsWorkOrderStepRequestModel } from "../../work-order-models";
import { expected, workOrderRoute } from "../../work-order-route";

export const dynamic = "force-dynamic";

/**
 * Sends a draft for approval (CM-1104). The first submission takes the
 * number from the `work_order` sequence rule. Needs Work Order update, or
 * create for its creator.
 */
export const POST = workOrderRoute(
  ["create", "update"],
  async (session, id, request) => {
    const model = parseOrThrow(
      ConstructionContractsWorkOrderStepRequestModel.safeParse(
        await request.json(),
      ),
    );
    return workOrderHandlers.submit(
      session.access,
      id,
      expected(model.expectedUpdatedAt),
    );
  },
);
