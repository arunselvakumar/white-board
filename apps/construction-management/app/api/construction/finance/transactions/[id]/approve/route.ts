import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  transactionHandlers as handlers,
  requireTransactionAccess,
  toTransactionResponse,
} from "../../handlers";
import {
  ApproveConstructionFinanceTransactionRequestModel,
  ConstructionFinanceDocumentParamsModel,
} from "../../transaction-models";

export const dynamic = "force-dynamic";

/**
 * Approves a pending Transaction and posts its account entry (CM-702).
 * Refused on or before the Financial Closing Date. Needs approve on its
 * Project.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionFinanceDocumentParamsModel.safeParse(await context.params),
    );
    const session = await requireTransactionAccess(request, id, "approve");
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
      toTransactionResponse(await handlers.get(session.access, id)),
    );
  } catch (error) {
    return mapError(error);
  }
}
