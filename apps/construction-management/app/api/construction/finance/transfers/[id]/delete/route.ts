import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  transferHandlers as handlers,
  requireTransferAccess,
} from "../../../transactions/handlers";
import {
  ConstructionFinanceDocumentParamsModel,
  DeleteConstructionFinanceTransactionRequestModel,
} from "../../../transactions/transaction-models";

export const dynamic = "force-dynamic";

/** Deletes a transfer; an approved one is reversed on both accounts first. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionFinanceDocumentParamsModel.safeParse(await context.params),
    );
    const session = await requireTransferAccess(request, id, "delete");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      DeleteConstructionFinanceTransactionRequestModel.safeParse(
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
