import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { purchaseOrderActions } from "@/src/procurement/application/purchase-order-handlers";

import {
  purchaseOrderHandlers as handlers,
  requirePurchaseOrderAccess,
} from "../../handlers";
import {
  ConstructionProcurementPurchaseOrderParamsModel,
  CloseConstructionProcurementPurchaseOrderRequestModel,
  toPurchaseOrderDetailResponse,
} from "../../purchase-order-models";

export const dynamic = "force-dynamic";

/** Closes an ordered, short-supplied Purchase Order with a reason (CM-0015 §8); it stops counting as pending receipt. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionProcurementPurchaseOrderParamsModel.safeParse(
        await context.params,
      ),
    );
    const session = await requirePurchaseOrderAccess(request, id, ["update"]);
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      CloseConstructionProcurementPurchaseOrderRequestModel.safeParse(
        await request.json(),
      ),
    );
    const expected =
      model.expectedUpdatedAt == null
        ? undefined
        : new Date(model.expectedUpdatedAt);
    await handlers.close(session.access, id, model.reason, expected);
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
