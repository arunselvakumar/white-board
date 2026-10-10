import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { centralStore } from "../stores/central-store-wiring";
import {
  GetConstructionProcurementCentralInventoryRequestModel,
  parseLocations,
  toCentralInventoryResponse,
} from "./central-inventory-models";

export const dynamic = "force-dynamic";

/**
 * Central Inventory (Central Inventory read): stock per material at every
 * Project and Store with what is in transit to each, by location,
 * category and stock state (ADR CM-0015 §12).
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const session = await requireAccess(
      request,
      "procurement.central_inventory",
      "read",
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      GetConstructionProcurementCentralInventoryRequestModel.safeParse(
        Object.fromEntries(url.searchParams),
      ),
    );
    const inventory = await centralStore.inventory.inventory({
      workspaceId: session.workspaceId,
      locations: parseLocations(model.locations),
      categoryId: model.categoryId,
      state: model.state,
      search: model.search,
    });
    return Response.json(toCentralInventoryResponse(inventory));
  } catch (error) {
    return mapError(error);
  }
}
