import { mapError } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { contentDisposition } from "@/app/api/_lib/uploads";
import { priceIndexHandlers } from "@/src/composition/contracts-escalation";
import { PRICE_INDEX_MENU } from "@/src/contracts/application/escalation-ports";
import { XLSX_CONTENT_TYPE } from "@/src/contracts/infrastructure/item-workbook";
import { priceIndexExport } from "@/src/contracts/infrastructure/price-index-workbook";

export const dynamic = "force-dynamic";

/**
 * Every index as .xlsx in the import sample's columns (Series, Month,
 * Value), by series then month (CM-1109). Needs the Item Library's Export.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, PRICE_INDEX_MENU, "export");
    if (isResponse(session)) return session;
    const rows = await priceIndexHandlers.export(session.access);
    return new Response(await priceIndexExport(rows), {
      headers: {
        "content-type": XLSX_CONTENT_TYPE,
        "content-disposition": contentDisposition(
          "attachment",
          "price-indices.xlsx",
        ),
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return mapError(error);
  }
}
