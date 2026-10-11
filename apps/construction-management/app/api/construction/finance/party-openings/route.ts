import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  finance,
  requestPartyType,
  requestPlace,
  requirePlaceAccess,
  requirePlaceAnyAccess,
} from "../parties/handlers";
import {
  ListConstructionFinancePartyOpeningsRequestModel,
  SetConstructionFinancePartyOpeningRequestModel,
  toOpeningResponse,
  type ConstructionFinancePartyOpeningResponse,
  type ListConstructionFinancePartyOpeningsResponse,
} from "./party-opening-models";

export const dynamic = "force-dynamic";

/** The opening balances of one party type on a Project (Parties read). */
export async function GET(request: Request): Promise<Response> {
  try {
    const query = Object.fromEntries(new URL(request.url).searchParams);
    const place = requestPlace(query, requestPartyType(query));
    const session = await requirePlaceAccess(request, "read", place);
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ListConstructionFinancePartyOpeningsRequestModel.safeParse(query),
    );
    const items = await finance.openings.list(
      session.workspaceId,
      model.partyType,
      place,
    );
    const body: ListConstructionFinancePartyOpeningsResponse = {
      items: items.map(toOpeningResponse),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Sets a party's opening balance on a Project (CM-0017 §7): adds it
 * (Parties create) or changes it (Parties update, with
 * `expectedUpdatedAt`), reversing and posting the `opening` entry.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const raw: unknown = await request.json();
    const place = requestPlace(raw, requestPartyType(raw));
    const session = await requirePlaceAnyAccess(
      request,
      ["create", "update"],
      place,
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      SetConstructionFinancePartyOpeningRequestModel.safeParse(raw),
    );
    const id = await finance.openings.set(session.access, {
      ...model,
      expectedUpdatedAt:
        model.expectedUpdatedAt == null
          ? null
          : new Date(model.expectedUpdatedAt),
    });
    const body: ConstructionFinancePartyOpeningResponse = toOpeningResponse(
      await finance.openings.get(session.workspaceId, id),
    );
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
