import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  transferHandlers as handlers,
  requireTransferAccess,
  toTransferResponse,
} from "../../../transactions/handlers";
import {
  ApproveConstructionFinanceTransactionRequestModel,
  ConstructionFinanceDocumentParamsModel,
} from "../../../transactions/transaction-models";

export const dynamic = "force-dynamic";

/** Approves a pending transfer: `transfer_out` on the from account, `transfer_in` on the to account. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionFinanceDocumentParamsModel.safeParse(await context.params),
    );
    const session = await requireTransferAccess(request, id, "approve");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ApproveConstructionFinanceTransactionRequestModel.safeParse(
        await request.json(),
      ),
    );
    await handlers.decide(
      session.access,
      id,
      { approve: true },
      model.expectedUpdatedAt == null
        ? null
        : new Date(model.expectedUpdatedAt),
    );
    return Response.json(
      toTransferResponse(await handlers.get(session.access, id)),
    );
  } catch (error) {
    return mapError(error);
  }
}
