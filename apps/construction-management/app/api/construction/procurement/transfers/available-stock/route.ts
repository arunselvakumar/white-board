import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { materialTransfers, requireTransferSession } from "../handlers";
import {
  GetConstructionProcurementTransferStockRequestModel,
  type GetConstructionProcurementTransferStockResponseModel,
} from "../transfer-models";

export const dynamic = "force-dynamic";

/** Available stock at a transfer's source, for the form (Create or Update on the source). */
export async function GET(request: Request): Promise<Response> {
  try {
    const query = parseOrThrow(
      GetConstructionProcurementTransferStockRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const session = await requireTransferSession(request, false);
    if (isResponse(session)) return session;
    const stock = await materialTransfers.availableStock(
      session.caller,
      { kind: query.fromKind, id: query.fromId },
      query.materialIds,
      query.on,
    );
    const body: GetConstructionProcurementTransferStockResponseModel = {
      stock: Object.fromEntries(stock),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
