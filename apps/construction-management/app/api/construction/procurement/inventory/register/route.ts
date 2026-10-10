import { prisma } from "@repo/construction-db";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { procurementDirectory } from "@/src/composition/procurement-directory";
import { requireStockLocation } from "@/src/procurement/infrastructure/inventory-locations";
import { stockRegister } from "@/src/procurement/infrastructure/inventory-queries";

import { requireInventoryAccess } from "../handlers";
import {
  GetConstructionProcurementStockRegisterRequestModel,
  toStockRegisterResponse,
} from "../inventory-models";

export const dynamic = "force-dynamic";

/**
 * The Stock Register for a date range (CM-506): per material Opening,
 * Received, Transferred in / out, Issued, Received from store, Consumed,
 * Missing, Adjustment and Closing (Report on Current Inventory).
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const query = parseOrThrow(
      GetConstructionProcurementStockRegisterRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const location = { kind: query.locationKind, id: query.locationId };
    const session = await requireInventoryAccess(request, location, "report");
    if (isResponse(session)) return session;
    const named = await requireStockLocation(
      prisma,
      procurementDirectory,
      session.workspaceId,
      location,
    );
    const range = { from: query.from, to: query.to };
    const rows = await stockRegister(
      prisma,
      procurementDirectory,
      session.workspaceId,
      location,
      range,
    );
    return Response.json(toStockRegisterResponse(named, range, rows));
  } catch (error) {
    return mapError(error);
  }
}
