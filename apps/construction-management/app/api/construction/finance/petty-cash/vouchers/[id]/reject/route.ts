import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  PETTY_CASH_MENU,
  datesFor,
  pettyCashVouchers,
  voucherBody,
  voucherIdOf,
  type IdContext,
} from "../../../handlers";
import { RejectConstructionFinancePettyCashVoucherRequestModel } from "../../../petty-cash-models";

export const dynamic = "force-dynamic";

/**
 * Rejects a pending voucher with a reason (Petty Cash Reject, on its
 * Project). It can be edited and resubmitted.
 */
export async function POST(
  request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const session = await requireAccess(request, PETTY_CASH_MENU, "reject");
    if (isResponse(session)) return session;
    const id = await voucherIdOf(context);
    const model = parseOrThrow(
      RejectConstructionFinancePettyCashVoucherRequestModel.safeParse(
        await request.json(),
      ),
    );
    await pettyCashVouchers.decide(
      session.access,
      await datesFor(session),
      [id],
      { approve: false, reason: model.reason },
    );
    return Response.json(
      voucherBody(session, await pettyCashVouchers.get(session.access, id)),
    );
  } catch (error) {
    return mapError(error);
  }
}
