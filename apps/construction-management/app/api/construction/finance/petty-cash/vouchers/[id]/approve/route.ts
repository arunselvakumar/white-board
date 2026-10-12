import { mapError } from "@/app/api/_lib/map-error";
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

export const dynamic = "force-dynamic";

/**
 * Approves a pending voucher (Petty Cash Approve, on its Project) and posts
 * its entries. 409 PETTY_CASH_VOUCHER_NOT_PENDING; 403
 * FINANCIAL_PERIOD_CLOSED when dated on or before the closing date.
 */
export async function POST(
  request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const session = await requireAccess(request, PETTY_CASH_MENU, "approve");
    if (isResponse(session)) return session;
    const id = await voucherIdOf(context);
    await pettyCashVouchers.decide(
      session.access,
      await datesFor(session),
      [id],
      { approve: true },
    );
    return Response.json(
      voucherBody(session, await pettyCashVouchers.get(session.access, id)),
    );
  } catch (error) {
    return mapError(error);
  }
}
