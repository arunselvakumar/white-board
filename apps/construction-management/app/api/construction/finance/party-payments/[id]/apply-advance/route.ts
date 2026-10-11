import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { finance } from "../../../parties/handlers";
import { ConstructionFinancePartyIdParamsModel } from "../../../parties/party-shared-models";
import { paymentBody, requirePaymentAccess } from "../../handlers";
import { ApplyConstructionFinancePartyPaymentAdvanceRequestModel } from "../../party-payment-models";

export const dynamic = "force-dynamic";

/**
 * **Apply advance** (CM-0017 §7): allocates the unallocated part of a
 * payment to the party's open invoices on the place. No money moves.
 * Needs Parties update.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionFinancePartyIdParamsModel.safeParse(await context.params),
    );
    const session = await requirePaymentAccess(request, id, "update");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ApplyConstructionFinancePartyPaymentAdvanceRequestModel.safeParse(
        await request.json(),
      ),
    );
    await finance.payments.applyAdvance(
      session.access,
      id,
      new Date(model.expectedUpdatedAt),
      model.allocations,
    );
    return Response.json(await paymentBody(session, id));
  } catch (error) {
    return mapError(error);
  }
}
