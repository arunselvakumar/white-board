import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { requestProjectId } from "../../project-scope";
import {
  OTHER_EXPENSE_MENU,
  otherExpenseHandlers as handlers,
} from "../handlers";
import {
  BulkRejectConstructionFinanceOtherExpensesRequestModel,
  type BulkDecideConstructionFinanceOtherExpensesResponseModel,
} from "../other-expense-models";

export const dynamic = "force-dynamic";

/**
 * Rejects several pending Other Expenses of one Project at once, all or
 * none (CM-0015 §2): if any is not pending, not the Project's or dated in
 * a closed period, nothing changes and 409 BULK_DECISION_REFUSED lists
 * each refusal.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const raw: unknown = await request.json();
    const session = await requireAccess(request, OTHER_EXPENSE_MENU, "reject", {
      projectId: requestProjectId(raw),
    });
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      BulkRejectConstructionFinanceOtherExpensesRequestModel.safeParse(raw),
    );
    const decided = await handlers.bulkDecide(
      session.access,
      model.projectId,
      model.ids,
      { approve: false, reason: model.reason },
    );
    const body: BulkDecideConstructionFinanceOtherExpensesResponseModel = {
      decided,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
