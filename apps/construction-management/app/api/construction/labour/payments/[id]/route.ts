import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  paymentFinancial,
  requirePaymentAccess,
  wagePaymentHandlers as handlers,
} from "../handlers";
import {
  ConstructionLabourWagePaymentParamsModel,
  toWagePaymentResponse,
} from "../payment-models";

export const dynamic = "force-dynamic";

/** One live payment (Labour or Vendor read on its Project). */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionLabourWagePaymentParamsModel.safeParse(await context.params),
    );
    const session = await requirePaymentAccess(request, "read", (workspaceId) =>
      handlers.get(workspaceId, id),
    );
    if (isResponse(session)) return session;
    const payment = session.target;
    return Response.json(
      toWagePaymentResponse(
        payment,
        paymentFinancial(session.access, payment.partyType, payment.projectId),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
