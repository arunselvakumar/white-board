import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { requireInventoryAccess, stockMovements } from "../handlers";
import {
  AdjustConstructionProcurementStockRequestModel,
  toStockMovementResponse,
} from "../inventory-models";

export const dynamic = "force-dynamic";

/**
 * Adjust stock (Update): the counted quantity on a date and a reason; the
 * difference from the stock that day posts as an Adjustment.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      AdjustConstructionProcurementStockRequestModel.safeParse(
        await request.json(),
      ),
    );
    const session = await requireInventoryAccess(
      request,
      model.location,
      "update",
    );
    if (isResponse(session)) return session;
    const movement = await stockMovements.adjust(session.caller, {
      location: model.location,
      materialId: model.materialId,
      date: model.date,
      countedQty: model.countedQty,
      reason: model.reason,
    });
    return Response.json(toStockMovementResponse(movement), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
