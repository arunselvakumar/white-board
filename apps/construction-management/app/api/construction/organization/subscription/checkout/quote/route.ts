import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import {
  isResponse,
  requireOwnerSession,
} from "@/app/api/_lib/require-session";
import { createSubscriptionHandlers } from "@/src/organization/infrastructure/create-subscription-handlers";

import { toQuoteResponse } from "../../subscription-fields";
import { QuoteConstructionOrganizationCheckoutRequestModel } from "./quote-checkout-request-model";

export const dynamic = "force-dynamic";

const handlers = createSubscriptionHandlers();

/** Prices a checkout choice without buying anything (CM-117). Owner only. */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireOwnerSession(request);
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      QuoteConstructionOrganizationCheckoutRequestModel.safeParse(
        await request.json(),
      ),
    );
    const quote = await handlers.quote({
      workspaceId: session.workspaceId,
      choice: model,
      stateCode: model.stateCode,
    });
    return Response.json(toQuoteResponse(quote));
  } catch (error) {
    return mapError(error);
  }
}
