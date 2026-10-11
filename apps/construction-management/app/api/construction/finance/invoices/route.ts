import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { invoiceActions } from "@/src/finance/application/invoice-handlers";

import {
  cursors,
  finance,
  pageParams,
  requestPartyType,
  requestPlace,
  requirePlaceAccess,
} from "../parties/handlers";
import { invoiceBody } from "./handlers";
import {
  CreateConstructionFinanceInvoiceRequestModel,
  ListConstructionFinanceInvoicesRequestModel,
  toInvoiceResponse,
  type ListConstructionFinanceInvoicesResponse,
} from "./invoice-models";

export const dynamic = "force-dynamic";

/**
 * Invoices on a Project (or a Store), newest first: by party, direction,
 * status, outstanding or overdue (CM-705, CM-706, CM-708). Needs Parties
 * read on the Project; a Store is the Owner's.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const query = Object.fromEntries(new URL(request.url).searchParams);
    const place = requestPlace(query, requestPartyType(query));
    const session = await requirePlaceAccess(request, "read", place);
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ListConstructionFinanceInvoicesRequestModel.safeParse(query),
    );
    const page = await finance.invoices.list(
      {
        workspaceId: session.workspaceId,
        place,
        partyType: model.partyType,
        partyId: model.partyId,
        direction: model.direction,
        status: model.status,
        outstanding: model.outstanding === "true",
        overdue: model.overdue === "true",
        search: model.search,
      },
      pageParams(model),
    );
    const body: ListConstructionFinanceInvoicesResponse = {
      items: page.items.map((item) =>
        toInvoiceResponse(item, invoiceActions(session.access, item)),
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
 * Records an invoice (CM-705, CM-706, CM-708): a bill from a Contractor,
 * Supplier or Other Party (typed number, unique per party), or a sales
 * invoice to an Other Party (INV number). A Supplier's invoice may gather
 * GRNs awaiting an invoice. Posts the party entry. Needs Parties create.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const raw: unknown = await request.json();
    const place = requestPlace(raw, requestPartyType(raw));
    const session = await requirePlaceAccess(request, "create", place);
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      CreateConstructionFinanceInvoiceRequestModel.safeParse(raw),
    );
    const id = await finance.invoices.create(session.access, model);
    return Response.json(await invoiceBody(session, id), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
