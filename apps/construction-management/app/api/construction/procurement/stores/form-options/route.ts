import { mapError } from "@/app/api/_lib/map-error";
import { requireAnyAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { centralStore } from "../central-store-wiring";
import type { GetConstructionProcurementStoreFormOptionsResponseModel } from "../store-models";

export const dynamic = "force-dynamic";

/**
 * What the store form offers: live Projects, active Team Members (store
 * keepers) and active Suppliers (Central store create or update).
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAnyAccess(
      request,
      "procurement.central_store",
      ["create", "update"],
    );
    if (isResponse(session)) return session;
    const body: GetConstructionProcurementStoreFormOptionsResponseModel =
      await centralStore.stores.formOptions(session.workspaceId);
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
