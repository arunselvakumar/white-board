import { StatusCodes } from "http-status-codes";

import { mapError } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  PETTY_CASH_MENU,
  datesFor,
  pettyCashVouchers,
  voucherIdOf,
  type IdContext,
} from "../../../handlers";

export const dynamic = "force-dynamic";

/**
 * Deletes a voucher (Petty Cash Delete, on its Project); an approved one
 * has its entries reversed first.
 */
export async function POST(
  request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const session = await requireAccess(request, PETTY_CASH_MENU, "delete");
    if (isResponse(session)) return session;
    await pettyCashVouchers.delete(
      session.access,
      await datesFor(session),
      await voucherIdOf(context),
    );
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
