import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { renderGoodsReceiptPdf } from "@/src/procurement/infrastructure/goods-receipt-pdf";

import { ConstructionProcurementGoodsReceiptParamsModel } from "../../goods-receipt-models";
import {
  goodsReceiptHandlers as handlers,
  receiptFinancial,
  requireReceiptAccess,
} from "../../handlers";

export const dynamic = "force-dynamic";

/**
 * The GRN PDF (Material Received print): amounts only with Financial,
 * hidden fields left out.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionProcurementGoodsReceiptParamsModel.safeParse(
        await context.params,
      ),
    );
    const session = await requireReceiptAccess(request, "print", id);
    if (isResponse(session)) return session;
    const { view, company } = await handlers.printable(session.receipt);
    const bytes = await renderGoodsReceiptPdf({
      view,
      company,
      financial: receiptFinancial(session.access, session.receipt.location),
    });
    const fileName = `${view.number.replace(/[^A-Za-z0-9._-]+/g, "-")}.pdf`;
    return new Response(Buffer.from(bytes), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${fileName}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return mapError(error);
  }
}
