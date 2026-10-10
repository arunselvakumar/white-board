import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { decodeListCursor } from "@/src/shared-kernel/list-cursor";

import { actorOf, pageCursors } from "./central-store-access";
import { centralStore } from "./central-store-wiring";
import {
  CreateConstructionProcurementStoreRequestModel,
  ListConstructionProcurementStoresRequestModel,
  toStoreResponse,
  type ListConstructionProcurementStoresResponseModel,
} from "./store-models";

export const dynamic = "force-dynamic";

/** The Company's Central Stores, newest first (Central store read: every store). */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const model = parseOrThrow(
      ListConstructionProcurementStoresRequestModel.safeParse(
        Object.fromEntries(url.searchParams),
      ),
    );
    const session = await requireAccess(
      request,
      "procurement.central_store",
      "read",
    );
    if (isResponse(session)) return session;
    const page = await centralStore.stores.list({
      workspaceId: session.workspaceId,
      search: model.search,
      projectId: model.projectId,
      limit: model.limit,
      after: model.after == null ? undefined : decodeListCursor(model.after),
      before: model.before == null ? undefined : decodeListCursor(model.before),
    });
    const body: ListConstructionProcurementStoresResponseModel = {
      items: page.items.map(toStoreResponse),
      ...pageCursors(page, model),
      total: page.total,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/** Creates a Central Store (Central store create). */
export async function POST(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      CreateConstructionProcurementStoreRequestModel.safeParse(
        await request.json(),
      ),
    );
    const session = await requireAccess(
      request,
      "procurement.central_store",
      "create",
    );
    if (isResponse(session)) return session;
    const store = await centralStore.stores.create(actorOf(session), model);
    return Response.json(toStoreResponse(store), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
