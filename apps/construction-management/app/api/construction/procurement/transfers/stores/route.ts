import { mapError } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { materialTransfers, requireTransferSession } from "../handlers";
import type { ListConstructionProcurementTransferStoresResponseModel } from "../transfer-models";

export const dynamic = "force-dynamic";

/** Live Stores by name for the transfer form's From and To (Material Transfer Read). */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireTransferSession(request, false);
    if (isResponse(session)) return session;
    const body: ListConstructionProcurementTransferStoresResponseModel = {
      items: await materialTransfers.storeOptions(session.caller),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
