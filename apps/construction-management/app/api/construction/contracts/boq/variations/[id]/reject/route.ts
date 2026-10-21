import { parseOrThrow } from "@/app/api/_lib/map-error";

import { variationHandlers } from "../../../boq-access";
import { RejectConstructionContractsVariationRequestModel } from "../../../boq-models";
import { variationRoute } from "../../variation-route";

export const dynamic = "force-dynamic";

/**
 * Rejects a pending Variation with a reason (CM-1103; 400
 * REJECTION_REASON_REQUIRED, 409 VARIATION_NOT_PENDING). Needs BOQ reject.
 */
export const POST = variationRoute("reject", async (session, id, request) => {
  const model = parseOrThrow(
    RejectConstructionContractsVariationRequestModel.safeParse(
      await request.json(),
    ),
  );
  return variationHandlers.reject(session.access, id, model.reason);
});
