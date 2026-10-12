import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  ConstructionFinanceAccountParamsModel,
  DeleteConstructionFinanceAccountRequestModel,
} from "../../account-models";
import { accountHandlers as handlers } from "../../handlers";

export const dynamic = "force-dynamic";

/**
 * Deletes a company account nothing has used (CM-701): 409
 * `ACCOUNT_PRIMARY` for the primary, `ACCOUNT_IN_USE` when money has moved
 * through it or a document names it. Its opening entry is reversed.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "masters.bank_accounts",
      "delete",
    );
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionFinanceAccountParamsModel.safeParse(await context.params),
    );
    const model = parseOrThrow(
      DeleteConstructionFinanceAccountRequestModel.safeParse(
        await request.json(),
      ),
    );
    await handlers.delete(
      session.access,
      id,
      new Date(model.expectedUpdatedAt),
    );
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
