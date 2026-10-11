import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { finance } from "../../../parties/handlers";
import { ConstructionFinancePartyIdParamsModel } from "../../../parties/party-shared-models";
import { requireInvoiceAccess } from "../../handlers";
import { DeleteConstructionFinanceInvoiceRequestModel } from "../../invoice-models";

export const dynamic = "force-dynamic";

/**
 * Deletes an invoice (Parties delete): its entry is reversed and its GRNs
 * await an invoice again. 409 `INVOICE_ALLOCATED` once a payment or a
 * settlement points at it.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionFinancePartyIdParamsModel.safeParse(await context.params),
    );
    const session = await requireInvoiceAccess(request, id, "delete");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      DeleteConstructionFinanceInvoiceRequestModel.safeParse(
        await request.json(),
      ),
    );
    await finance.invoices.delete(
      session.access,
      id,
      new Date(model.expectedUpdatedAt),
    );
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
