import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { paymentActions } from "@/src/finance/application/party-payment-handlers";

import {
  cursors,
  finance,
  pageParams,
  requestPartyType,
  requestPlace,
  requirePlaceAccess,
} from "../parties/handlers";
import { paymentBody } from "./handlers";
import {
  ListConstructionFinancePartyPaymentsRequestModel,
  RecordConstructionFinancePartyPaymentRequestModel,
  toPartyPaymentResponse,
  type ListConstructionFinancePartyPaymentsResponse,
} from "./party-payment-models";

export const dynamic = "force-dynamic";

/** Party payments on a Project (or Store), newest first (Parties read). */
export async function GET(request: Request): Promise<Response> {
  try {
    const query = Object.fromEntries(new URL(request.url).searchParams);
    const place = requestPlace(query, requestPartyType(query));
    const session = await requirePlaceAccess(request, "read", place);
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ListConstructionFinancePartyPaymentsRequestModel.safeParse(query),
    );
    const page = await finance.payments.list(
      {
        workspaceId: session.workspaceId,
        place,
        partyType: model.partyType,
        partyId: model.partyId,
        direction: model.direction,
        from: model.from,
        to: model.to,
        search: model.search,
      },
      pageParams(model),
    );
    const body: ListConstructionFinancePartyPaymentsResponse = {
      items: page.items.map((item) =>
        toPartyPaymentResponse(item, paymentActions(session.access, item)),
      ),
      ...cursors(page, model),
      total: page.total,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Records a party payment (CM-0017 §6–§8): PAY number, the account entry
 * and the party entries in one transaction, allocations across the
 * party's open invoices on the place (the rest is an advance), TDS 194C on
 * a Contractor payment. Needs Parties create; 409 `DUPLICATE_REFERENCE`
 * unless confirmed.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const raw: unknown = await request.json();
    const place = requestPlace(raw, requestPartyType(raw));
    const session = await requirePlaceAccess(request, "create", place);
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      RecordConstructionFinancePartyPaymentRequestModel.safeParse(raw),
    );
    const id = await finance.payments.record(session.access, model);
    return Response.json(await paymentBody(session, id), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
