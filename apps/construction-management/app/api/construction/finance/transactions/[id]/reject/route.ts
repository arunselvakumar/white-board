import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  transactionHandlers as handlers,
  requireTransactionAccess,
  toTransactionResponse,
} from "../../handlers";
import {
  ConstructionFinanceDocumentParamsModel,
  RejectConstructionFinanceTransactionRequestModel,
} from "../../transaction-models";

export const dynamic = "force-dynamic";

/** Rejects a pending Transaction with a reason (CM-702). Needs reject on its Project. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionFinanceDocumentParamsModel.safeParse(await context.params),
    );
    const session = await requireTransactionAccess(request, id, "reject");
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
      toTransactionResponse(await handlers.get(session.access, id)),
    );
  } catch (error) {
    return mapError(error);
  }
}
