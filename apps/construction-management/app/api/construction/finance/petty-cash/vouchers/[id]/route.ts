import { mapError } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  PETTY_CASH_MENU,
  pettyCashVouchers,
  voucherBody,
  voucherIdOf,
  type IdContext,
} from "../../handlers";

export const dynamic = "force-dynamic";

/**
 * One voucher with what the caller may do with it. 404
 * PETTY_CASH_VOUCHER_NOT_FOUND for another holder's voucher without View
 * all, or one on a Project the caller is not on.
 */
export async function GET(
  request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const session = await requireAccess(request, PETTY_CASH_MENU, "read");
    if (isResponse(session)) return session;
    const view = await pettyCashVouchers.get(
      session.access,
      await voucherIdOf(context),
    );
    return Response.json(voucherBody(session, view));
  } catch (error) {
    return mapError(error);
  }
}
