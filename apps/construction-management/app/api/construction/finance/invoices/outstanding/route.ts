import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { invoiceActions } from "@/src/finance/application/invoice-handlers";

import {
  finance,
  requestPartyType,
  requestPlace,
  requirePlaceAccess,
} from "../../parties/handlers";
import {
  ListConstructionFinanceOutstandingInvoicesRequestModel,
  toInvoiceResponse,
  type ListConstructionFinanceOutstandingInvoicesResponse,
} from "../invoice-models";

export const dynamic = "force-dynamic";

/**
 * A party's invoices with a balance on a Project (or Store), oldest due
 * first: the payment form's allocation table (Parties read).
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const query = Object.fromEntries(new URL(request.url).searchParams);
    const place = requestPlace(query, requestPartyType(query));
    const session = await requirePlaceAccess(request, "read", place);
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ListConstructionFinanceOutstandingInvoicesRequestModel.safeParse(query),
    );
    const items = await finance.invoices.outstanding(
      session.workspaceId,
      { type: model.partyType, id: model.partyId },
      place,
      model.direction ?? "payable",
    );
    const body: ListConstructionFinanceOutstandingInvoicesResponse = {
      items: items.map((item) =>
        toInvoiceResponse(item, invoiceActions(session.access, item)),
      ),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
