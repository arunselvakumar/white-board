import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { storeNotFound } from "@/src/procurement/infrastructure/store-repository";

import { centralStore } from "../../central-store-wiring";
import {
  ConstructionProcurementStoreParamsModel,
  type GetConstructionProcurementStoreStockResponseModel,
} from "../../store-models";

export const dynamic = "force-dynamic";

/** The store's stock per material, with what is in transit to it (Central store read). */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionProcurementStoreParamsModel.safeParse(await context.params),
    );
    const session = await requireAccess(
      request,
      "procurement.central_store",
      "read",
    );
    if (isResponse(session)) return session;
    const store = await centralStore.stores.get(session.workspaceId, id);
    if (store == null) throw storeNotFound();
    const body: GetConstructionProcurementStoreStockResponseModel = {
      items: await centralStore.stores.stock(session.workspaceId, id),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
