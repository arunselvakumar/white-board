import { mapError } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { readUpload } from "@/app/api/_lib/uploads";
import { priceIndexHandlers } from "@/src/composition/contracts-escalation";
import { PRICE_INDEX_MENU } from "@/src/contracts/application/escalation-ports";
import { readPriceIndexSheet } from "@/src/contracts/infrastructure/price-index-workbook";

import type { ImportConstructionContractsPriceIndicesResponseModel } from "../price-index-models";

export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Imports Series, Month and Value rows (CM-1109): the body is the .xlsx
 * itself. A new series and month is added; an existing one has its value
 * replaced. All rows or none: 400 IMPORT_HAS_ERRORS with `details.errors`
 * = [{ row, column, message }], IMPORT_EMPTY, IMPORT_TOO_MANY (over
 * 2,000 rows), IMPORT_FILE_INVALID. Needs the Item Library's Import.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, PRICE_INDEX_MENU, "import");
    if (isResponse(session)) return session;
    const upload = await readUpload(request, MAX_BYTES);
    const rows = await readPriceIndexSheet(upload.bytes);
    const body: ImportConstructionContractsPriceIndicesResponseModel =
      await priceIndexHandlers.importSheet(session.access, rows);
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
