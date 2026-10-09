import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { createBalanceHandlers } from "@/src/labour/infrastructure/wage-payment-factory";

import { paymentFinancial, paymentMenu } from "../../payments/handlers";
import {
  GetConstructionLabourStatementRequestModel,
  toStatementResponse,
} from "../balance-models";

export const dynamic = "force-dynamic";

const handlers = createBalanceHandlers();

/**
 * One party's ledger between two dates with the running balance, the
 * Project and the source of each entry (the balance view, CM-216).
 * Reversals are listed, so cancelled payments and re-marked days show.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      GetConstructionLabourStatementRequestModel.safeParse(
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
    const statement = await handlers.statement({
      workspaceId: session.workspaceId,
      projectId: model.projectId,
      partyType: model.partyType,
      partyId: model.partyId,
      from: model.from,
      to: model.to,
    });
    return Response.json(
      toStatementResponse(
        statement,
        paymentFinancial(session.access, model.partyType, model.projectId),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
