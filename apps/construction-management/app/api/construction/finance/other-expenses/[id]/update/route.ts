import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  expenseResponse,
  otherExpenseHandlers as handlers,
  requireOtherExpenseAccess,
} from "../../handlers";
import {
  ConstructionFinanceOtherExpenseParamsModel,
  UpdateConstructionFinanceOtherExpenseRequestModel,
} from "../../other-expense-models";

export const dynamic = "force-dynamic";

/**
 * Saves an Other Expense still as loaded (CM-704): an approved one has its
 * account entry reversed and goes back to pending, a rejected one goes
 * back to pending; Save & Approve (needs Approve) approves it again.
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
    const session = await requireOtherExpenseAccess(request, id, "update");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      UpdateConstructionFinanceOtherExpenseRequestModel.safeParse(
        await request.json(),
      ),
    );
    const { expectedUpdatedAt, ...input } = model;
    await handlers.update(
      session.access,
      id,
      new Date(expectedUpdatedAt),
      input,
    );
    return Response.json(await expenseResponse(session, id));
  } catch (error) {
    return mapError(error);
  }
}
