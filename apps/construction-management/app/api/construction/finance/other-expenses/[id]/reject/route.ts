import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  expenseResponse,
  otherExpenseHandlers as handlers,
  requireOtherExpenseAccess,
} from "../../handlers";
import {
  ConstructionFinanceOtherExpenseParamsModel,
  RejectConstructionFinanceOtherExpenseRequestModel,
} from "../../other-expense-models";

export const dynamic = "force-dynamic";

/** Rejects a pending Other Expense with a reason (Reject on its Project). */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionFinanceOtherExpenseParamsModel.safeParse(
        await context.params,
      ),
    );
    const session = await requireOtherExpenseAccess(request, id, "reject");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      RejectConstructionFinanceOtherExpenseRequestModel.safeParse(
        await request.json(),
      ),
    );
    await handlers.decide(
      session.access,
      id,
      { approve: false, reason: model.reason },
      model.expectedUpdatedAt == null
        ? undefined
        : new Date(model.expectedUpdatedAt),
    );
    return Response.json(await expenseResponse(session, id));
  } catch (error) {
    return mapError(error);
  }
}
