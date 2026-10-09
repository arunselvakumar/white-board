import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  requirePaymentAccess,
  wagePaymentHandlers as handlers,
} from "../../handlers";
import {
  CancelConstructionLabourWagePaymentRequestModel,
  ConstructionLabourWagePaymentParamsModel,
} from "../../payment-models";

export const dynamic = "force-dynamic";

/**
 * Cancels a payment (CM-215): the row is tombstoned and its ledger entry
 * reversed, so the balance is restored. Needs Labour or Vendor delete on
 * the payment's Project; the back-dated edit limit applies to its date.
 * There is no edit: cancel and record again.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionLabourWagePaymentParamsModel.safeParse(await context.params),
    );
    const model = parseOrThrow(
      CancelConstructionLabourWagePaymentRequestModel.safeParse(
        await request.json(),
      ),
    );
    const session = await requirePaymentAccess(
      request,
      "delete",
      (workspaceId) => handlers.get(workspaceId, id),
    );
    if (isResponse(session)) return session;
    await handlers.cancel({
      actor: {
        workspaceId: session.workspaceId,
        userId: session.userId,
        role: session.role,
      },
      id,
      expectedUpdatedAt: new Date(model.expectedUpdatedAt),
    });
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
