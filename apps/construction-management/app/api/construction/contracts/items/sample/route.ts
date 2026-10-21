import { mapError } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { contentDisposition } from "@/app/api/_lib/uploads";
import {
  itemImportSample,
  XLSX_CONTENT_TYPE,
} from "@/src/contracts/infrastructure/item-workbook";

import { ITEMS_MENU } from "../handlers";

export const dynamic = "force-dynamic";

/**
 * The Item import sample (CM-1102): the columns Code, Short description,
 * Description, UoM, SAC/HSN, Schedule and Rate (₹) with two example rows.
 * Needs the Item Library's Import flag.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, ITEMS_MENU, "import");
    if (isResponse(session)) return session;
    return new Response(await itemImportSample(), {
      headers: {
        "content-type": XLSX_CONTENT_TYPE,
        "content-disposition": contentDisposition(
          "attachment",
          "item-library-sample.xlsx",
        ),
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return mapError(error);
  }
}
