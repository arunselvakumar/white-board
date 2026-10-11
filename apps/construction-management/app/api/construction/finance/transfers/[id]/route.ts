import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  transferHandlers as handlers,
  requireTransferAccess,
  toTransferResponse,
} from "../../transactions/handlers";
import { ConstructionFinanceDocumentParamsModel } from "../../transactions/transaction-models";

export const dynamic = "force-dynamic";

/** One transfer (Transactions read on its Project). */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionFinanceDocumentParamsModel.safeParse(await context.params),
    );
    const session = await requireTransferAccess(request, id, "read");
    if (isResponse(session)) return session;
    return Response.json(
      toTransferResponse(await handlers.get(session.access, id)),
    );
  } catch (error) {
    return mapError(error);
  }
}
