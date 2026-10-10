import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { centralStore } from "../../stores/central-store-wiring";
import {
  GetConstructionProcurementStockLedgerRequestModel,
  parseLocations,
  toStockLedgerResponse,
} from "../central-inventory-models";

export const dynamic = "force-dynamic";

/** The Stock Ledger for a period (Central Inventory read): opening, movements by type, closing. */
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
      GetConstructionProcurementStockLedgerRequestModel.safeParse(
        Object.fromEntries(url.searchParams),
      ),
    );
    const report = await centralStore.inventory.stockLedger({
      workspaceId: session.workspaceId,
      ...model,
      locations: parseLocations(model.locations),
    });
    return Response.json(toStockLedgerResponse(report));
  } catch (error) {
    return mapError(error);
  }
}
