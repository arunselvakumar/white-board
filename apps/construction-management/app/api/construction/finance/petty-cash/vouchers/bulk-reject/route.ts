import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { PETTY_CASH_MENU, datesFor, pettyCashVouchers } from "../../handlers";
import {
  BulkRejectConstructionFinancePettyCashVouchersRequestModel,
  type BulkDecideConstructionFinancePettyCashVouchersResponseModel,
} from "../../petty-cash-models";
import type { z } from "zod";

export const dynamic = "force-dynamic";

/** Rejects several pending vouchers with one reason, all or none. */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, PETTY_CASH_MENU, "reject");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      BulkRejectConstructionFinancePettyCashVouchersRequestModel.safeParse(
        await request.json(),
      ),
    );
    const decided = await pettyCashVouchers.decide(
      session.access,
      await datesFor(session),
      model.ids,
      { approve: false, reason: model.reason },
    );
    const body: z.infer<
      typeof BulkDecideConstructionFinancePettyCashVouchersResponseModel
    > = { decided };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
