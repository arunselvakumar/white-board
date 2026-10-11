import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { finance } from "../../../parties/handlers";
import { ConstructionFinancePartyIdParamsModel } from "../../../parties/party-shared-models";
import { requirePaymentAccess } from "../../handlers";
import { CancelConstructionFinancePartyPaymentRequestModel } from "../../party-payment-models";

export const dynamic = "force-dynamic";

/**
 * **Cancel** a party payment (Parties delete): reverses the party and
 * account entries and frees its allocations. 403
 * `FINANCIAL_PERIOD_CLOSED` on or before the closing date.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionFinancePartyIdParamsModel.safeParse(await context.params),
    );
    const session = await requirePaymentAccess(request, id, "delete");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      CancelConstructionFinancePartyPaymentRequestModel.safeParse(
        await request.json(),
      ),
    );
    await finance.payments.cancel(
      session.access,
      id,
      new Date(model.expectedUpdatedAt),
    );
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
