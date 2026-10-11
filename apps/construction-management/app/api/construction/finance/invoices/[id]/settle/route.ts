import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { finance } from "../../../parties/handlers";
import { ConstructionFinancePartyIdParamsModel } from "../../../parties/party-shared-models";
import { invoiceBody, requireInvoiceAccess } from "../../handlers";
import { SettleConstructionFinanceInvoiceRequestModel } from "../../invoice-models";

export const dynamic = "force-dynamic";

/**
 * **Settle Invoice** (CM-0017 §7): raises a settlement of the balance with
 * a reason, pending approval (Parties create). 409 `SETTLEMENT_PENDING`
 * while one waits, `INVOICE_NO_BALANCE` when nothing is left.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionFinancePartyIdParamsModel.safeParse(await context.params),
    );
    const session = await requireInvoiceAccess(request, id, "create");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      SettleConstructionFinanceInvoiceRequestModel.safeParse(
        await request.json(),
      ),
    );
    await finance.settlements.raise(session.access, id, model.reason);
    return Response.json(await invoiceBody(session, id), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
