import { prisma } from "@repo/construction-db";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { procurementDirectory } from "@/src/composition/procurement-directory";
import { requireStockLocation } from "@/src/procurement/infrastructure/inventory-locations";
import {
  decodeHistoryCursor,
  inventoryHistory,
  inventoryRowOf,
} from "@/src/procurement/infrastructure/inventory-queries";

import { requireInventoryAccess } from "../handlers";
import {
  GetConstructionProcurementInventoryHistoryRequestModel,
  toInventoryRowResponse,
  toStockEntryResponse,
  type GetConstructionProcurementInventoryHistoryResponseModel,
} from "../inventory-models";

export const dynamic = "force-dynamic";

/**
 * A material's history at a location (CM-506): every ledger entry, newest
 * date first, with its source, counterparty, site location, who, and the
 * running balance; reversals are entries of their own (Read).
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const query = parseOrThrow(
      GetConstructionProcurementInventoryHistoryRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const location = { kind: query.locationKind, id: query.locationId };
    const session = await requireInventoryAccess(request, location, "read");
    if (isResponse(session)) return session;
    await requireStockLocation(
      prisma,
      procurementDirectory,
      session.workspaceId,
      location,
    );
    const [page, material] = await Promise.all([
      inventoryHistory(prisma, session.workspaceId, location, query.materialId, {
        limit: query.limit,
        after: query.after == null ? undefined : decodeHistoryCursor(query.after),
        before:
          query.before == null ? undefined : decodeHistoryCursor(query.before),
      }),
      inventoryRowOf(
        prisma,
        procurementDirectory,
        session.workspaceId,
        location,
        query.materialId,
      ),
    ]);
    const body: GetConstructionProcurementInventoryHistoryResponseModel = {
      material: material == null ? null : toInventoryRowResponse(material),
      items: page.items.map(toStockEntryResponse),
      nextCursor: page.nextCursor,
      prevCursor: page.prevCursor,
      total: page.total,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
