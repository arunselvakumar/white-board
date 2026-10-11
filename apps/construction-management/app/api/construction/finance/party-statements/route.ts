import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { invoiceActions } from "@/src/finance/application/invoice-handlers";

import { toInvoiceResponse } from "../invoices/invoice-models";
import {
  finance,
  requestPartyType,
  requestPlace,
  requirePlaceAccess,
} from "../parties/handlers";
import {
  GetConstructionFinancePartyStatementRequestModel,
  toStatementResponse,
} from "./party-statement-models";

export const dynamic = "force-dynamic";

/**
 * A party's statement on a Project (or Store): opening, every entry with
 * the running balance, closing, and the invoices still open (CM-705).
 * Needs Parties read.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const query = Object.fromEntries(new URL(request.url).searchParams);
    const place = requestPlace(query, requestPartyType(query));
    const session = await requirePlaceAccess(request, "read", place);
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      GetConstructionFinancePartyStatementRequestModel.safeParse(query),
    );
    const statement = await finance.queries.statement(session.access, {
      partyType: model.partyType,
      partyId: model.partyId,
      place,
      from: model.from,
      to: model.to,
    });
    return Response.json(
      toStatementResponse(
        statement,
        statement.openInvoices.map((invoice) =>
          toInvoiceResponse(invoice, invoiceActions(session.access, invoice)),
        ),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
