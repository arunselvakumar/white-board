import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { finance } from "../../../parties/handlers";
import { ConstructionFinancePartyIdParamsModel } from "../../../parties/party-shared-models";
import { requireSettlementAccess, settlementBody } from "../../handlers";
import { RejectConstructionFinanceSettlementRequestModel } from "../../settlement-models";

export const dynamic = "force-dynamic";

/** Rejects a settlement with a reason; the invoice stays open (Parties reject). */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionFinancePartyIdParamsModel.safeParse(await context.params),
    );
    const session = await requireSettlementAccess(request, id, "reject");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      RejectConstructionFinanceSettlementRequestModel.safeParse(
        await request.json(),
      ),
    );
    await finance.settlements.reject(session.access, id, model.reason);
    return Response.json(await settlementBody(session, id));
  } catch (error) {
    return mapError(error);
  }
}
