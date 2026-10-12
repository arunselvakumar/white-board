import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  transferHandlers as handlers,
  requireTransferAccess,
  toTransferResponse,
} from "../../../transactions/handlers";
import {
  ConstructionFinanceDocumentParamsModel,
  UpdateConstructionFinanceTransferRequestModel,
} from "../../../transactions/transaction-models";

export const dynamic = "force-dynamic";

/**
 * Edits a transfer (CM-702): an approved one is reversed on both accounts
 * and goes back to pending. 409 `TRANSFER_CHANGED` when stale.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionFinanceDocumentParamsModel.safeParse(await context.params),
    );
    const session = await requireTransferAccess(request, id, "update");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      UpdateConstructionFinanceTransferRequestModel.safeParse(
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
      toTransferResponse(await handlers.get(session.access, id)),
    );
  } catch (error) {
    return mapError(error);
  }
}
