import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  transactionHandlers as handlers,
  requireTransactionAccess,
  toTransactionResponse,
} from "../../handlers";
import {
  ConstructionFinanceDocumentParamsModel,
  UpdateConstructionFinanceTransactionRequestModel,
} from "../../transaction-models";

export const dynamic = "force-dynamic";

/**
 * Edits a Transaction (CM-702): an approved one is reversed and goes back
 * to pending (or approved again with `approve`), a rejected one goes back
 * to pending. Needs update on its Project; 409 `TRANSACTION_CHANGED` when
 * stale.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionFinanceDocumentParamsModel.safeParse(await context.params),
    );
    const session = await requireTransactionAccess(request, id, "update");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      UpdateConstructionFinanceTransactionRequestModel.safeParse(
        await request.json(),
      ),
    );
    await handlers.update(
      session.access,
      id,
      new Date(model.expectedUpdatedAt),
      { ...model, amount: BigInt(model.amount) },
    );
    return Response.json(
      toTransactionResponse(await handlers.get(session.access, id)),
    );
  } catch (error) {
    return mapError(error);
  }
}
