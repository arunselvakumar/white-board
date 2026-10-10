import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { requireInventoryAccess, stockMovements } from "../../../handlers";
import {
  ConstructionProcurementStockMovementParamsModel,
  DeleteConstructionProcurementStockMovementRequestModel,
} from "../../../inventory-models";

export const dynamic = "force-dynamic";

/**
 * Delete a hand-entered stock entry (Delete at its location): a tombstone
 * and a reversal, refused when later stock depends on it.
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
    const session = await requireInventoryAccess(request, null, "delete");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      DeleteConstructionProcurementStockMovementRequestModel.safeParse(
        await request.json(),
      ),
    );
    await stockMovements.remove(
      session.caller,
      id,
      new Date(model.expectedUpdatedAt),
    );
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
