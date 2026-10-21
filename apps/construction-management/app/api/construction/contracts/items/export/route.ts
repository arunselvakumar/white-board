import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { contentDisposition } from "@/app/api/_lib/uploads";
import {
  itemExport,
  XLSX_CONTENT_TYPE,
} from "@/src/contracts/infrastructure/item-workbook";

import { ITEMS_MENU, itemHandlers as handlers } from "../handlers";
import { ExportConstructionContractsItemsRequestModel } from "../item-models";

export const dynamic = "force-dynamic";

/**
 * The Items of the list's current search and schedule as .xlsx, in the
 * import sample's columns and code order (CM-1102). At most 10,000 (400
 * EXPORT_TOO_MANY). Needs the Item Library's Export flag.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, ITEMS_MENU, "export");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ExportConstructionContractsItemsRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const items = await handlers.export(session.access, {
      search: model.q,
      schedule: model.schedule,
    });
    return new Response(await itemExport(items), {
      headers: {
        "content-type": XLSX_CONTENT_TYPE,
        "content-disposition": contentDisposition(
          "attachment",
          "item-library.xlsx",
        ),
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return mapError(error);
  }
}
