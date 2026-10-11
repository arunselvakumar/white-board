import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { renderPartyPaymentReceiptPdf } from "@/src/finance/infrastructure/party-payment-receipt-pdf";
import { rupeesInWords } from "@/src/procurement/domain/purchase-order-amount-words";

import { finance } from "../../../parties/handlers";
import { ConstructionFinancePartyIdParamsModel } from "../../../parties/party-shared-models";
import { requirePaymentAccess } from "../../handlers";

export const dynamic = "force-dynamic";

/**
 * A party payment's receipt PDF (CM-0017 §6): "Received with thanks" for a
 * Payment In, a payment voucher for a Payment Out. Needs Parties print.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionFinancePartyIdParamsModel.safeParse(await context.params),
    );
    const session = await requirePaymentAccess(request, id, "print");
    if (isResponse(session)) return session;
    const { view, company } = await finance.payments.printable(
      session.workspaceId,
      id,
    );
    const bytes = await renderPartyPaymentReceiptPdf({
      view,
      company,
      amountInWords: rupeesInWords,
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
