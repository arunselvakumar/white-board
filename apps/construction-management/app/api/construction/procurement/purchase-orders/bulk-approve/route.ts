import type { z } from "zod";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { purchaseOrderScope } from "@/src/procurement/application/purchase-order-handlers";

import {
  PURCHASE_ORDER_MENU,
  purchaseOrderHandlers as handlers,
} from "../handlers";
import {
  BulkApproveConstructionProcurementPurchaseOrdersRequestModel,
  placeOf,
  type BulkDecideConstructionProcurementPurchaseOrdersResponseModel,
} from "../purchase-order-models";

export const dynamic = "force-dynamic";

/**
 * Approves several pending Purchase Orders of one Project or Store at once. All or none (CM-0015 §2): if any is not pending or not at that
 * place, nothing changes and 409 `BULK_DECISION_REFUSED` lists each refusal.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      BulkApproveConstructionProcurementPurchaseOrdersRequestModel.safeParse(
        await request.json(),
      ),
    );
    const location = placeOf(model);
    const session = await requireAccess(
      request,
      PURCHASE_ORDER_MENU,
      "approve",
      purchaseOrderScope(location),
    );
    if (isResponse(session)) return session;
    const decided = await handlers.bulkDecide(
      session.access,
      location,
      model.ids,
      { approve: true },
    );
    const body: z.infer<
      typeof BulkDecideConstructionProcurementPurchaseOrdersResponseModel
    > = { decided };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
