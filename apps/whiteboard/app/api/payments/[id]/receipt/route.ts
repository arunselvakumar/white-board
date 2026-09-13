import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse, requireSession } from "@/app/api/_lib/require-session";
import { createEnrollmentHandlers } from "@/src/training/infrastructure/create-enrollment-handlers";

import { GetReceiptRequestModel } from "../../get-receipt-request-model";
import { mapFeePaymentResponse } from "../../map-fee-payment-response";

export const dynamic = "force-dynamic";

const handlers = createEnrollmentHandlers();

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const session = await requireSession();
    if (isResponse(session)) {
      return session;
    }
    const { id } = await context.params;
    const model = parseOrThrow(GetReceiptRequestModel.safeParse({ id }));
    const payment = await handlers.getReceipt.execute({
      id: model.id,
      workspaceId: session.orgId,
    });
    return Response.json(mapFeePaymentResponse(payment));
  } catch (error) {
    return mapError(error);
  }
}
