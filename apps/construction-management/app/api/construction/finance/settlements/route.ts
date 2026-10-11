import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { finance, PARTIES_MENU } from "../parties/handlers";
import {
  ListConstructionFinanceSettlementsRequestModel,
  toSettlementResponse,
  type ListConstructionFinanceSettlementsResponse,
} from "./settlement-models";

export const dynamic = "force-dynamic";

/**
 * Invoice settlements, newest first (CM-0017 §7): by status, on one
 * Project or every Project the caller reads Parties on (the Owner also
 * sees Stores). The approval list of CM-708.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const query = Object.fromEntries(new URL(request.url).searchParams);
    const model = parseOrThrow(
      ListConstructionFinanceSettlementsRequestModel.safeParse(query),
    );
    const session = await requireAccess(
      request,
      PARTIES_MENU,
      "read",
      model.projectId == null ? {} : { projectId: model.projectId },
    );
    if (isResponse(session)) return session;
    const items = await finance.settlements.list(session.access, model);
    const body: ListConstructionFinanceSettlementsResponse = {
      items: items.map(toSettlementResponse),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
