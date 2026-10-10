import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { readUpload } from "@/app/api/_lib/uploads";
import { readInventorySheet } from "@/src/procurement/infrastructure/inventory-workbook";

import { requireInventoryAccess, stockMovements } from "../handlers";
import {
  ImportConstructionProcurementInventoryRequestModel,
  toImportResponse,
} from "../inventory-models";

export const dynamic = "force-dynamic";

const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Import Inventory Stock (CM-506): the body is the .xlsx sample itself.
 * `?dryRun=true` (default) checks every row; `?dryRun=false` posts
 * Opening entries and Estimated Qty for every row or none — 400
 * `IMPORT_HAS_ERRORS` with the rows in `details`. Create on Current
 * Inventory (the menu has no Import flag).
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const query = parseOrThrow(
      ImportConstructionProcurementInventoryRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const location = { kind: query.locationKind, id: query.locationId };
    const session = await requireInventoryAccess(request, location, "create");
    if (isResponse(session)) return session;
    const upload = await readUpload(request, MAX_BYTES);
    const sheet = await readInventorySheet(upload.bytes);
    const dryRun = query.dryRun !== "false";
    const result = await stockMovements.import(session.caller, {
      location,
      sheet,
      openingDate: query.openingDate ?? null,
      dryRun,
    });
    return Response.json(toImportResponse(result), {
      status: dryRun ? StatusCodes.OK : StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
