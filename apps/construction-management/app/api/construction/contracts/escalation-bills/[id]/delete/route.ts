import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  escalationBillHandlers,
  expected,
  requireEscalationBillAccess,
} from "../../escalation-bill-access";
import {
  ConstructionContractsEscalationBillParamsModel,
  ConstructionContractsEscalationBillStepRequestModel,
} from "../../escalation-bill-models";

export const dynamic = "force-dynamic";

/**
 * Deletes a draft escalation bill (CM-1109; a tombstone). 409
 * BILL_STATUS_INVALID once submitted. Needs the side's bill Delete, or
 * Create for its creator.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionContractsEscalationBillParamsModel.safeParse(
        await context.params,
      ),
    );
    const session = await requireEscalationBillAccess(
      request,
      ["create", "delete"],
      id,
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ConstructionContractsEscalationBillStepRequestModel.safeParse(
        await request.json(),
      ),
    );
    await escalationBillHandlers.delete(
      session.access,
      id,
      expected(model.expectedUpdatedAt),
    );
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
