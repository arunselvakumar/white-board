import { prisma } from "@repo/construction-db";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requirePlanActive } from "@/app/api/_lib/require-plan-active";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import { loadMemberAccess } from "@/src/shared-kernel/access/prisma-access-reader";

import { transactionRegister } from "../handlers";
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
    const session = await requireCompanySession(request);
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      BulkDecideConstructionFinanceTransactionsRequestModel.safeParse(
        await request.json(),
      ),
    );
    const ended = await requirePlanActive(session);
    if (ended != null) return ended;
    const access = await loadMemberAccess(prisma, session);
    const result = await transactionRegister.bulkDecide(
      access,
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
