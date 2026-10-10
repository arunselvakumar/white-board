import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { purchaseOrderActions } from "@/src/procurement/application/purchase-order-handlers";

import {
  purchaseOrderHandlers as handlers,
  requirePurchaseOrderAccess,
} from "../handlers";
import {
  ConstructionProcurementPurchaseOrderParamsModel,
  toPurchaseOrderDetailResponse,
} from "../purchase-order-models";

export const dynamic = "force-dynamic";

/** One Purchase Order with lines, totals, terms and linked Goods Receipts. */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionProcurementPurchaseOrderParamsModel.safeParse(
        await context.params,
      ),
    );
    const session = await requirePurchaseOrderAccess(request, id, ["read"]);
    if (isResponse(session)) return session;
    const po = await handlers.get(session.workspaceId, id);
    return Response.json(
      toPurchaseOrderDetailResponse(
        po,
        purchaseOrderActions(session.access, po),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
