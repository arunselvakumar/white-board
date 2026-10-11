import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { expenseResponse, requireOtherExpenseAccess } from "../handlers";
import { ConstructionFinanceOtherExpenseParamsModel } from "../other-expense-models";

export const dynamic = "force-dynamic";

/** One live Other Expense (Other Expenses read on its Project). */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionFinanceOtherExpenseParamsModel.safeParse(
        await context.params,
      ),
    );
    const session = await requireOtherExpenseAccess(request, id, "read");
    if (isResponse(session)) return session;
    return Response.json(await expenseResponse(session, id));
  } catch (error) {
    return mapError(error);
  }
}
