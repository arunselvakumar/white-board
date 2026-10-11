import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  transactionHandlers as handlers,
  requireTransactionAccess,
  toTransactionResponse,
} from "../handlers";
import { ConstructionFinanceDocumentParamsModel } from "../transaction-models";

export const dynamic = "force-dynamic";

/** One Transaction (Transactions read on its Project). */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionFinanceDocumentParamsModel.safeParse(await context.params),
    );
    const session = await requireTransactionAccess(request, id, "read");
    if (isResponse(session)) return session;
    return Response.json(
      toTransactionResponse(await handlers.get(session.access, id)),
    );
  } catch (error) {
    return mapError(error);
  }
}
