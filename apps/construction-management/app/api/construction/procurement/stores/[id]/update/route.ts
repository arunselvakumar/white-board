import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { actorOf } from "../../central-store-access";
import { centralStore } from "../../central-store-wiring";
import {
  ConstructionProcurementStoreParamsModel,
  toStoreResponse,
  UpdateConstructionProcurementStoreRequestModel,
} from "../../store-models";

export const dynamic = "force-dynamic";

/**
 * Edits a store (Central store update). Removing a Project that still has
 * open Material Requests to the store is refused.
 */
export async function POST(
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
      "update",
    );
    if (isResponse(session)) return session;
    const { expectedUpdatedAt, ...input } = parseOrThrow(
      UpdateConstructionProcurementStoreRequestModel.safeParse(
        await request.json(),
      ),
    );
    const store = await centralStore.stores.update(
      actorOf(session),
      id,
      input,
      new Date(expectedUpdatedAt),
    );
    return Response.json(toStoreResponse(store));
  } catch (error) {
    return mapError(error);
  }
}
