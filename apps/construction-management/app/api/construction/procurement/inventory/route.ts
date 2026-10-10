import { prisma } from "@repo/construction-db";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { procurementDirectory } from "@/src/composition/procurement-directory";
import { requireStockLocation } from "@/src/procurement/infrastructure/inventory-locations";
import { inventoryList } from "@/src/procurement/infrastructure/inventory-queries";

import { requireInventoryAccess } from "./handlers";
import {
  ListConstructionProcurementInventoryRequestModel,
  toInventoryListResponse,
} from "./inventory-models";

export const dynamic = "force-dynamic";

/**
 * Current Inventory of a Project or Store (CM-506): every material with a
 * ledger entry, a stock setting or stock in transit, by name, with its
 * state (Read on Current Inventory, or Central store for a Store).
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const query = parseOrThrow(
      ListConstructionProcurementInventoryRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const location = { kind: query.locationKind, id: query.locationId };
    const session = await requireInventoryAccess(request, location, "read");
    if (isResponse(session)) return session;
    const named = await requireStockLocation(
      prisma,
      procurementDirectory,
      session.workspaceId,
      location,
    );
    const list = await inventoryList(
      prisma,
      procurementDirectory,
      session.workspaceId,
      location,
      { categoryId: query.categoryId, state: query.state, search: query.search },
    );
    return Response.json(toInventoryListResponse(named, list));
  } catch (error) {
    return mapError(error);
  }
}
