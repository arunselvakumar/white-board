import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { inventorySample } from "@/src/procurement/infrastructure/inventory-workbook";

import { requireInventoryAccess, xlsxResponse } from "../handlers";
import { SampleConstructionProcurementInventoryRequestModel } from "../inventory-models";

export const dynamic = "force-dynamic";

/** Export Sample Excel: the import sheet (Material, Quantity, Unit, Estimated Qty). */
export async function GET(request: Request): Promise<Response> {
  try {
    const query = parseOrThrow(
      SampleConstructionProcurementInventoryRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const location = { kind: query.locationKind, id: query.locationId };
    const session = await requireInventoryAccess(request, location, "read");
    if (isResponse(session)) return session;
    return xlsxResponse(
      await inventorySample([]),
      "inventory-import-sample.xlsx",
    );
  } catch (error) {
    return mapError(error);
  }
}
