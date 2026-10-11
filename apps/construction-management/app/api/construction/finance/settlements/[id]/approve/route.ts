import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { finance } from "../../../parties/handlers";
import { ConstructionFinancePartyIdParamsModel } from "../../../parties/party-shared-models";
import { requireSettlementAccess, settlementBody } from "../../handlers";

export const dynamic = "force-dynamic";

/**
 * Approves a settlement (Parties approve): re-reads the invoice's balance,
 * posts the write-off and marks the invoice Settled. 409
 * `SETTLEMENT_NOT_PENDING` / `INVOICE_NO_BALANCE`.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionFinancePartyIdParamsModel.safeParse(await context.params),
    );
    const session = await requireSettlementAccess(request, id, "approve");
    if (isResponse(session)) return session;
    await finance.settlements.approve(session.access, id);
    return Response.json(await settlementBody(session, id));
  } catch (error) {
    return mapError(error);
  }
}
