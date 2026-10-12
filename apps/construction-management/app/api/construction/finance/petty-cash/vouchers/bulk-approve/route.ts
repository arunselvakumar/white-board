import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { PETTY_CASH_MENU, datesFor, pettyCashVouchers } from "../../handlers";
import {
  BulkApproveConstructionFinancePettyCashVouchersRequestModel,
  type BulkDecideConstructionFinancePettyCashVouchersResponseModel,
} from "../../petty-cash-models";
import type { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * Approves several pending vouchers at once, all or none (CM-0015 §2): if
 * any refuses, nothing changes and 409 BULK_DECISION_REFUSED lists each.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, PETTY_CASH_MENU, "approve");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      BulkApproveConstructionFinancePettyCashVouchersRequestModel.safeParse(
        await request.json(),
      ),
    );
    const decided = await pettyCashVouchers.decide(
      session.access,
      await datesFor(session),
      model.ids,
      { approve: true },
    );
    const body: z.infer<
      typeof BulkDecideConstructionFinancePettyCashVouchersResponseModel
    > = { decided };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
