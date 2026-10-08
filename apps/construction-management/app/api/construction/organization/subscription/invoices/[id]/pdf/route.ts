import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import {
  isResponse,
  requireOwnerSession,
} from "@/app/api/_lib/require-session";
import { createSubscriptionHandlers } from "@/src/organization/infrastructure/create-subscription-handlers";
import { renderInvoicePdf } from "@/src/organization/infrastructure/invoice-pdf";

import { GetConstructionOrganizationInvoicePdfParamsModel } from "./get-invoice-pdf-params-model";

export const dynamic = "force-dynamic";

const handlers = createSubscriptionHandlers();

/** The tax invoice of a paid order as a PDF (CM-117). Owner only. */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireOwnerSession(request);
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      GetConstructionOrganizationInvoicePdfParamsModel.safeParse(
        await context.params,
      ),
    );
    const order = await handlers.invoice(session.workspaceId, id);
    const pdf = await renderInvoicePdf(order);
    const name = (order.invoiceNumber ?? order.id).replace(/\//g, "-");
    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="invoice-${name}.pdf"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return mapError(error);
  }
}
