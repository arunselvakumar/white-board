import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  transferHandlers as handlers,
  requireTransferAccess,
  toTransferResponse,
} from "../../../transactions/handlers";
import {
  ConstructionFinanceDocumentParamsModel,
  RejectConstructionFinanceTransactionRequestModel,
} from "../../../transactions/transaction-models";

export const dynamic = "force-dynamic";

/** Rejects a pending transfer with a reason. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionFinanceDocumentParamsModel.safeParse(await context.params),
    );
    const session = await requireTransferAccess(request, id, "reject");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      RejectConstructionFinanceTransactionRequestModel.safeParse(
        await request.json(),
      ),
    );
    await handlers.decide(
      session.access,
      id,
      { approve: false, reason: model.reason },
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
