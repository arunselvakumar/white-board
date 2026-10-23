import { mapError } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { contentDisposition } from "@/app/api/_lib/uploads";
import { PRICE_INDEX_MENU } from "@/src/contracts/application/escalation-ports";
import { XLSX_CONTENT_TYPE } from "@/src/contracts/infrastructure/item-workbook";
import { priceIndexSample } from "@/src/contracts/infrastructure/price-index-workbook";

export const dynamic = "force-dynamic";

/** The price index import sample (CM-1109). Needs the Item Library's Import. */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, PRICE_INDEX_MENU, "import");
    if (isResponse(session)) return session;
    return new Response(await priceIndexSample(), {
      headers: {
        "content-type": XLSX_CONTENT_TYPE,
        "content-disposition": contentDisposition(
          "attachment",
          "price-indices-sample.xlsx",
        ),
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return mapError(error);
  }
}
