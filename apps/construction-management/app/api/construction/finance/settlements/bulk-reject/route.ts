import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { finance, PARTIES_MENU } from "../../parties/handlers";
import {
  BulkRejectConstructionFinanceSettlementsRequestModel,
  toSettlementResponse,
  type ListConstructionFinanceSettlementsResponse,
} from "../settlement-models";

export const dynamic = "force-dynamic";

/** Rejects settlements with one reason, all or none (409 `BULK_DECISION_REFUSED`). */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, PARTIES_MENU, "reject");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      BulkRejectConstructionFinanceSettlementsRequestModel.safeParse(
        await request.json(),
      ),
    );
    await finance.settlements.bulkReject(
      session.access,
      model.ids,
      model.reason,
    );
    const items = await Promise.all(
      model.ids.map((id) => finance.settlements.get(session.access, id)),
    );
    const body: ListConstructionFinanceSettlementsResponse = {
      items: items.map(toSettlementResponse),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
