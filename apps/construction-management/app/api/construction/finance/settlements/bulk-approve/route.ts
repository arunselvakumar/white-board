import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { finance, PARTIES_MENU } from "../../parties/handlers";
import {
  BulkApproveConstructionFinanceSettlementsRequestModel,
  toSettlementResponse,
  type ListConstructionFinanceSettlementsResponse,
} from "../settlement-models";

export const dynamic = "force-dynamic";

/**
 * Approves settlements all or none (CM-0015 §2): when any refuses, nothing
 * changes and 409 `BULK_DECISION_REFUSED` lists each refusal.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, PARTIES_MENU, "approve");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      BulkApproveConstructionFinanceSettlementsRequestModel.safeParse(
        await request.json(),
      ),
    );
    await finance.settlements.bulkApprove(session.access, model.ids);
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
