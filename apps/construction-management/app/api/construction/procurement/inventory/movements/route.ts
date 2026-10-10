import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { requireInventoryAccess, stockMovements } from "../handlers";
import {
  RecordConstructionProcurementStockMovementsRequestModel,
  toStockMovementResponse,
  type RecordConstructionProcurementStockMovementsResponseModel,
} from "../inventory-models";

export const dynamic = "force-dynamic";

/**
 * Consume Material or Missing Material, one or many lines (Create): each
 * line a back-dated-checked entry, refused (409 `STOCK_INSUFFICIENT`) when
 * the stock on that date or any later date would go below zero.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      RecordConstructionProcurementStockMovementsRequestModel.safeParse(
        await request.json(),
      ),
    );
    const session = await requireInventoryAccess(
      request,
      model.location,
      "create",
    );
    if (isResponse(session)) return session;
    const movements = await stockMovements.record(session.caller, {
      location: model.location,
      kind: model.kind,
      lines: model.lines,
    });
    const body: RecordConstructionProcurementStockMovementsResponseModel = {
      items: movements.map(toStockMovementResponse),
    };
    return Response.json(body, { status: StatusCodes.CREATED });
  } catch (error) {
    return mapError(error);
  }
}
