import { prisma } from "@repo/construction-db";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { procurementDirectory } from "@/src/composition/procurement-directory";
import { requireStockLocation } from "@/src/procurement/infrastructure/inventory-locations";
import { stockRegister } from "@/src/procurement/infrastructure/inventory-queries";
import { stockRegisterExport } from "@/src/procurement/infrastructure/inventory-workbook";

import { fileSlug, requireInventoryAccess, xlsxResponse } from "../../handlers";
import { GetConstructionProcurementStockRegisterRequestModel } from "../../inventory-models";

export const dynamic = "force-dynamic";

/** The Stock Register as .xlsx (Report on Current Inventory). */
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
    return xlsxResponse(
      await stockRegisterExport(named.name, range, rows),
      `stock-register-${fileSlug(named.name)}-${range.from}-to-${range.to}.xlsx`,
    );
  } catch (error) {
    return mapError(error);
  }
}
