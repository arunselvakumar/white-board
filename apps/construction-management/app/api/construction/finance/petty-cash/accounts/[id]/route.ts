import { mapError } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  PETTY_CASH_MENU,
  accountIdOf,
  pettyCashAccounts,
  type IdContext,
} from "../../handlers";
import { toPettyCashAccountResponse } from "../../petty-cash-models";

export const dynamic = "force-dynamic";

/** One petty-cash account the caller may see (404 otherwise). */
export async function GET(
  request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const session = await requireAccess(request, PETTY_CASH_MENU, "read");
    if (isResponse(session)) return session;
    const view = await pettyCashAccounts.get(
      session.access,
      await accountIdOf(context),
    );
    return Response.json(toPettyCashAccountResponse(view));
  } catch (error) {
    return mapError(error);
  }
}
