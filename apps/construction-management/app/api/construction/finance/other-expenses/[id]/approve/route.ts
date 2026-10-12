import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  expenseResponse,
  otherExpenseHandlers as handlers,
  requireOtherExpenseAccess,
} from "../../handlers";
import {
  ApproveConstructionFinanceOtherExpenseRequestModel,
  ConstructionFinanceOtherExpenseParamsModel,
} from "../../other-expense-models";

export const dynamic = "force-dynamic";

/**
 * Approves a pending Other Expense (Approve on its Project), posting its
 * account entry. 409 OTHER_EXPENSE_NOT_PENDING otherwise; 403
 * FINANCIAL_PERIOD_CLOSED when it is dated in a closed period.
 */
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
    const session = await requireOtherExpenseAccess(request, id, "approve");
    if (isResponse(session)) return session;
    const text = await request.text();
    const model = parseOrThrow(
      ApproveConstructionFinanceOtherExpenseRequestModel.safeParse(
        text.trim() === "" ? {} : JSON.parse(text),
      ),
    );
    await handlers.decide(
      session.access,
      id,
      { approve: true },
      model.expectedUpdatedAt == null
        ? undefined
        : new Date(model.expectedUpdatedAt),
    );
    return Response.json(await expenseResponse(session, id));
  } catch (error) {
    return mapError(error);
  }
}
