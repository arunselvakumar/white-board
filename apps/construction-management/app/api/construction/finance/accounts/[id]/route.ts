import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { ConstructionFinanceAccountParamsModel } from "../account-models";
import { accountHandlers as handlers, toAccountResponse } from "../handlers";

export const dynamic = "force-dynamic";

/** One company account (Company's Bank A/C read). */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "masters.bank_accounts",
      "read",
    );
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionFinanceAccountParamsModel.safeParse(await context.params),
    );
    return Response.json(
      toAccountResponse(await handlers.get(session.access, id)),
    );
  } catch (error) {
    return mapError(error);
  }
}
