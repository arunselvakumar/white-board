import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { finance } from "../../../parties/handlers";
import { ConstructionFinancePartyIdParamsModel } from "../../../parties/party-shared-models";
import { invoiceBody, requireInvoiceAccess } from "../../handlers";
import { UpdateConstructionFinanceInvoiceRequestModel } from "../../invoice-models";

export const dynamic = "force-dynamic";

/**
 * Edits an invoice (Parties update). A new amount or date reverses the
 * party entry and posts the new one; 409 `INVOICE_BELOW_ALLOCATED` below
 * what payments settle, `INVOICE_CHANGED` when stale, `INVOICE_SETTLED`
 * once written off.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionFinancePartyIdParamsModel.safeParse(await context.params),
    );
    const session = await requireInvoiceAccess(request, id, "update");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      UpdateConstructionFinanceInvoiceRequestModel.safeParse(
        await request.json(),
      ),
    );
    await finance.invoices.update(
      session.access,
      id,
      new Date(model.expectedUpdatedAt),
      model,
    );
    return Response.json(await invoiceBody(session, id));
  } catch (error) {
    return mapError(error);
  }
}
