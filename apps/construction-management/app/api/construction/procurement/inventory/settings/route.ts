import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { requireInventoryAccess, stockSettings } from "../handlers";
import {
  toInventoryRowResponse,
  UpdateConstructionProcurementStockSettingsRequestModel,
} from "../inventory-models";

export const dynamic = "force-dynamic";

/**
 * Update / Add Estimation Qty, the minimum-stock override and the alert
 * toggle of one material at a location (Update). Returns its stock row.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      UpdateConstructionProcurementStockSettingsRequestModel.safeParse(
        await request.json(),
      ),
    );
    const session = await requireInventoryAccess(request, model.location, "update");
    if (isResponse(session)) return session;
    const row = await stockSettings.update(
      session.caller,
      model.location,
      model.materialId,
      {
        estimatedQty: model.estimatedQty,
        minStockQty: model.minStockQty,
        minAlertEnabled: model.minAlertEnabled,
      },
    );
    return Response.json(toInventoryRowResponse(row));
  } catch (error) {
    return mapError(error);
  }
}
