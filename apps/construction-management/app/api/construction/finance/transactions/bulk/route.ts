import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAnyAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { MENU, transactionRegister } from "../handlers";
import { BulkDecideConstructionFinanceTransactionsRequestModel } from "../transaction-models";

export const dynamic = "force-dynamic";

/**
 * Bulk approve or reject Transactions and transfers (CM-702), all or none.
 * Each one is checked for approve / reject on its own Project; any
 * refusal is 409 `BULK_DECISION_REFUSED` listing them, and nothing
 * changes.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    // Approve or Reject somewhere first (401 / 403 before validation);
    // each item is checked on its own Project in bulkDecide.
    const session = await requireAnyAccess(request, MENU, [
      "approve",
      "reject",
    ]);
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      BulkDecideConstructionFinanceTransactionsRequestModel.safeParse(
        await request.json(),
      ),
    );
    const result = await transactionRegister.bulkDecide(
      session.access,
      model.items,
      model.approve
        ? { approve: true }
        : { approve: false, reason: model.reason ?? "" },
    );
    return Response.json(result);
  } catch (error) {
    return mapError(error);
  }
}
