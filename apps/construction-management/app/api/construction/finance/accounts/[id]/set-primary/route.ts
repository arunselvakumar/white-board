import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { ConstructionFinanceAccountParamsModel } from "../../account-models";
import { accountHandlers as handlers, toAccountResponse } from "../../handlers";

export const dynamic = "force-dynamic";

/**
 * Set As Primary (CM-701): the account becomes the default "paid from";
 * the flag moves in one transaction. Company accounts only. Needs
 * Company's Bank A/C update.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "masters.bank_accounts",
      "update",
    );
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionFinanceAccountParamsModel.safeParse(await context.params),
    );
    await handlers.setPrimary(session.access, id);
    return Response.json(
      toAccountResponse(await handlers.get(session.access, id)),
    );
  } catch (error) {
    return mapError(error);
  }
}
