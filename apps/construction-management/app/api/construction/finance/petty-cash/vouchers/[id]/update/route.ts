import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  PETTY_CASH_MENU,
  datesFor,
  pettyCashVouchers,
  voucherBody,
  voucherIdOf,
  voucherInputOf,
  type IdContext,
} from "../../../handlers";
import { UpdateConstructionFinancePettyCashVoucherRequestModel } from "../../../petty-cash-models";

export const dynamic = "force-dynamic";

/**
 * Changes a voucher (Petty Cash Update, on its Project): a rejected one is
 * resubmitted, an approved one has its entries reversed; either returns
 * to pending. 409 PETTY_CASH_VOUCHER_CHANGED when stale.
 */
export async function POST(
  request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const session = await requireAccess(request, PETTY_CASH_MENU, "update");
    if (isResponse(session)) return session;
    const id = await voucherIdOf(context);
    const model = parseOrThrow(
      UpdateConstructionFinancePettyCashVoucherRequestModel.safeParse(
        await request.json(),
      ),
    );
    await pettyCashVouchers.update(
      session.access,
      await datesFor(session),
      id,
      {
        ...voucherInputOf(model),
        expectedUpdatedAt: new Date(model.expectedUpdatedAt),
      },
    );
    return Response.json(
      voucherBody(session, await pettyCashVouchers.get(session.access, id)),
    );
  } catch (error) {
    return mapError(error);
  }
}
