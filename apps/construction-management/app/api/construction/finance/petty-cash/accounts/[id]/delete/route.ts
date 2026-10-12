import { StatusCodes } from "http-status-codes";

import { mapError } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  PETTY_CASH_MENU,
  accountIdOf,
  pettyCashAccounts,
  type IdContext,
} from "../../../handlers";

export const dynamic = "force-dynamic";

/**
 * Closes a petty-cash account with no vouchers and no entries but its
 * opening (Petty Cash Delete); 409 PETTY_CASH_ACCOUNT_IN_USE otherwise.
 */
export async function POST(
  request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const session = await requireAccess(request, PETTY_CASH_MENU, "delete");
    if (isResponse(session)) return session;
    await pettyCashAccounts.close(session.access, await accountIdOf(context));
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
