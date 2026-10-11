import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  finance,
  requestPartyType,
  requestPlace,
  requirePlaceAccess,
} from "./handlers";
import {
  ListConstructionFinancePartyBalancesRequestModel,
  toPartyBalancesResponse,
} from "./party-balance-models";

export const dynamic = "force-dynamic";

/**
 * Each Contractor's, Supplier's or Other Party's money on a Project (or a
 * Store): opening, invoiced, paid, TDS, written off, balance, overdue and
 * advance, with totals (CM-705, CM-706). Needs Parties read.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const query = Object.fromEntries(new URL(request.url).searchParams);
    const place = requestPlace(query, requestPartyType(query));
    const session = await requirePlaceAccess(request, "read", place);
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ListConstructionFinancePartyBalancesRequestModel.safeParse(query),
    );
    const balances = await finance.queries.balances(
      session.access,
      model.partyType,
      place,
    );
    return Response.json(toPartyBalancesResponse(balances));
  } catch (error) {
    return mapError(error);
  }
}
