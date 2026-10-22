import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  clientBillHandlers,
  requireClientBillAccess,
} from "../../client-bill-access";
import {
  ConstructionContractsClientBillParamsModel,
  ConstructionContractsClientBillStepRequestModel,
} from "../../client-bill-models";
import { expected } from "../../client-bill-route";

export const dynamic = "force-dynamic";

/**
 * Deletes a draft Client Bill (CM-1107; a tombstone) and frees its rows.
 * 409 BILL_STATUS_INVALID once submitted. Needs Client Bill delete, or
 * create for its creator.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionContractsClientBillParamsModel.safeParse(
        await context.params,
      ),
    );
    const session = await requireClientBillAccess(
      request,
      ["create", "delete"],
      id,
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ConstructionContractsClientBillStepRequestModel.safeParse(
        await request.json(),
      ),
    );
    await clientBillHandlers.delete(
      session.access,
      id,
      expected(model.expectedUpdatedAt),
    );
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
