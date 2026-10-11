import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { ConstructionFinancePartyIdParamsModel } from "../../parties/party-shared-models";
import { paymentBody, requirePaymentAccess } from "../handlers";

export const dynamic = "force-dynamic";

/** One party payment with its allocations and TDS (Parties read). */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionFinancePartyIdParamsModel.safeParse(await context.params),
    );
    const session = await requirePaymentAccess(request, id, "read");
    if (isResponse(session)) return session;
    return Response.json(await paymentBody(session, id));
  } catch (error) {
    return mapError(error);
  }
}
