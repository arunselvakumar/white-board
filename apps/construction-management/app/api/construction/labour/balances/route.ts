import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { createBalanceHandlers } from "@/src/labour/infrastructure/wage-payment-factory";

import { paymentFinancial, paymentMenu } from "../payments/handlers";
import {
  GetConstructionLabourBalancesRequestModel,
  toBalancesResponse,
} from "./balance-models";

export const dynamic = "force-dynamic";

const handlers = createBalanceHandlers();

/**
 * Previous Balance, To Pay, Advance, Paid and Final Amount for a period,
 * per labourer (Labour read on the Project) or vendor (Vendor read) of a
 * Project (CM-214, ADR CM-0004). Figures are party-wide: a balance
 * belongs to the party across Projects. Amounts need Financial.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      GetConstructionLabourBalancesRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const session = await requireAccess(
      request,
      paymentMenu(model.partyType),
      "read",
      { projectId: model.projectId },
    );
    if (isResponse(session)) return session;
    const balances = await handlers.balances({
      workspaceId: session.workspaceId,
      projectId: model.projectId,
      partyType: model.partyType,
      kind: model.kind,
      anchor: model.anchor,
      to: model.to,
    });
    return Response.json(
      toBalancesResponse(
        balances,
        paymentFinancial(session.access, model.partyType, model.projectId),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
