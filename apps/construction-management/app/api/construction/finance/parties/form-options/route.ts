import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  finance,
  requestPartyType,
  requestPlace,
  requirePlaceAccess,
} from "../handlers";
import {
  GetConstructionFinancePartyFormOptionsRequestModel,
  type GetConstructionFinancePartyFormOptionsResponse,
} from "../party-balance-models";

export const dynamic = "force-dynamic";

/** A party's options for the invoice form: a Contractor's Departments (Parties read). */
export async function GET(request: Request): Promise<Response> {
  try {
    const query = Object.fromEntries(new URL(request.url).searchParams);
    const place = requestPlace(query, requestPartyType(query));
    const session = await requirePlaceAccess(request, "read", place);
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      GetConstructionFinancePartyFormOptionsRequestModel.safeParse(query),
    );
    const body: GetConstructionFinancePartyFormOptionsResponse =
      await finance.queries.invoiceFormOptions(
        session.access,
        { type: model.partyType, id: model.partyId },
        place,
      );
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
