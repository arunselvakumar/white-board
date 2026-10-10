import { prisma } from "@repo/construction-db";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { procurementDirectory } from "@/src/composition/procurement-directory";
import { requireStockLocation } from "@/src/procurement/infrastructure/inventory-locations";
import { inventoryList } from "@/src/procurement/infrastructure/inventory-queries";
import { inventoryExport } from "@/src/procurement/infrastructure/inventory-workbook";

import { fileSlug, requireInventoryAccess, xlsxResponse } from "../handlers";
import { ExportConstructionProcurementInventoryRequestModel } from "../inventory-models";

export const dynamic = "force-dynamic";

/** Export Data: the stock list with the same filters, as .xlsx (Print). */
export async function GET(request: Request): Promise<Response> {
  try {
    const query = parseOrThrow(
      ExportConstructionProcurementInventoryRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const location = { kind: query.locationKind, id: query.locationId };
    const session = await requireInventoryAccess(request, location, "print");
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
      {
        categoryId: query.categoryId,
        state: query.state,
        search: query.search,
      },
    );
    return xlsxResponse(
      await inventoryExport(named.name, list.items),
      `inventory-${fileSlug(named.name)}.xlsx`,
    );
  } catch (error) {
    return mapError(error);
  }
}
