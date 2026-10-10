import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { storeNotFound } from "@/src/procurement/infrastructure/store-repository";

import { centralStore } from "../central-store-wiring";
import {
  ConstructionProcurementStoreParamsModel,
  toStoreResponse,
} from "../store-models";

export const dynamic = "force-dynamic";

/** One live store (Central store read). */
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
    return Response.json(toStoreResponse(store));
  } catch (error) {
    return mapError(error);
  }
}
