import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  ConstructionFinanceAccountParamsModel,
  UpdateConstructionFinanceAccountRequestModel,
} from "../../account-models";
import { accountHandlers as handlers, toAccountResponse } from "../../handlers";

export const dynamic = "force-dynamic";

/**
 * Edits a company account (CM-701): a changed opening balance or date
 * posts the reversal of the old opening entry and a new one. Needs
 * Company's Bank A/C update; 409 `ACCOUNT_CHANGED` when stale.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionFinanceAccountParamsModel.safeParse(await context.params),
    );
    const session = await requireAccess(
      request,
      "masters.bank_accounts",
      "update",
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      UpdateConstructionFinanceAccountRequestModel.safeParse(
        await request.json(),
      ),
    );
    await handlers.update(
      session.access,
      id,
      new Date(model.expectedUpdatedAt),
      {
        ...model,
        openingBalance: BigInt(model.openingBalance),
      },
    );
    return Response.json(
      toAccountResponse(await handlers.get(session.access, id)),
    );
  } catch (error) {
    return mapError(error);
  }
}
