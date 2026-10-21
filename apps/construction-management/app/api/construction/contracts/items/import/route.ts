import { mapError } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { readUpload } from "@/app/api/_lib/uploads";
import { readItemSheet } from "@/src/contracts/infrastructure/item-workbook";

import { ITEMS_MENU, itemHandlers as handlers } from "../handlers";
import type { ImportConstructionContractsItemsResponseModel } from "../item-models";

export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Imports Items from the sample (CM-1102, ADR CM-0023 §3): the body is the
 * .xlsx itself. Rows are matched by Code ignoring case: a new code adds an
 * Item, an existing one has its fields replaced (never its rate analysis).
 * All rows or none: 400 `IMPORT_HAS_ERRORS` with `details.errors` =
 * [{ row, column, message }], `IMPORT_EMPTY`, `IMPORT_TOO_MANY` (over
 * 2,000 rows), `IMPORT_FILE_INVALID`. Needs the Item Library's Import flag.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, ITEMS_MENU, "import");
    if (isResponse(session)) return session;
    const upload = await readUpload(request, MAX_BYTES);
    const rows = await readItemSheet(upload.bytes);
    const body: ImportConstructionContractsItemsResponseModel =
      await handlers.importSheet(session.access, rows);
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
