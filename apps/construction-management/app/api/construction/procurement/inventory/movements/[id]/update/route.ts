import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { requireInventoryAccess, stockMovements } from "../../../handlers";
import {
  ConstructionProcurementStockMovementParamsModel,
  EditConstructionProcurementStockMovementRequestModel,
  toStockMovementResponse,
} from "../../../inventory-models";

export const dynamic = "force-dynamic";

/**
 * Edit a Consumed, Missing or Opening entry (Update at its location): its
 * ledger entries are reversed and reposted together (409
 * `STOCK_INSUFFICIENT`, `STOCK_MOVEMENT_CHANGED`, `STOCK_MOVEMENT_NOT_EDITABLE`).
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionProcurementStockMovementParamsModel.safeParse(
        await context.params,
      ),
    );
    const session = await requireInventoryAccess(request, null, "update");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      EditConstructionProcurementStockMovementRequestModel.safeParse(
        await request.json(),
      ),
    );
    const movement = await stockMovements.edit(session.caller, id, {
      date: model.date,
      quantity: model.quantity,
      siteLocation: model.siteLocation,
      remark: model.remark,
      expectedUpdatedAt: new Date(model.expectedUpdatedAt),
    });
    return Response.json(toStockMovementResponse(movement));
  } catch (error) {
    return mapError(error);
  }
}
