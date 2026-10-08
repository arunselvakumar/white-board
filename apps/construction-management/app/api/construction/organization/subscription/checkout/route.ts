import { StatusCodes } from "http-status-codes";

import { jsonError } from "@/app/api/_lib/json-error";
import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import {
  isResponse,
  requireOwnerSession,
} from "@/app/api/_lib/require-session";
import { PaymentsNotConfiguredError } from "@/src/organization/application/subscription-handlers";
import { createSubscriptionHandlers } from "@/src/organization/infrastructure/create-subscription-handlers";

import { toQuoteResponse } from "../subscription-fields";
import { StartConstructionOrganizationCheckoutRequestModel } from "./start-checkout-request-model";
import type { StartConstructionOrganizationCheckoutResponseModel } from "./start-checkout-response-model";

export const dynamic = "force-dynamic";

const handlers = createSubscriptionHandlers();

/**
 * Creates the order and its Razorpay order (CM-117). The browser then opens
 * Razorpay Checkout; the webhook (or `checkout/verify`) settles it. Owner
 * only, and allowed on an ended plan so the Owner can renew.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireOwnerSession(request);
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      StartConstructionOrganizationCheckoutRequestModel.safeParse(
        await request.json(),
      ),
    );
    const started = await handlers.checkout({
      workspaceId: session.workspaceId,
      by: session.userId,
      choice: model,
      billing: model.billingAddress,
    });
    const body: StartConstructionOrganizationCheckoutResponseModel = {
      orderId: started.order.id,
      quote: toQuoteResponse(started.order.quote),
      razorpay: {
        keyId: started.gateway.keyId,
        orderId: started.gateway.orderId,
        amountPaise: started.gateway.amount,
        currency: started.gateway.currency,
      },
    };
    return Response.json(body, { status: StatusCodes.CREATED });
  } catch (error) {
    if (error instanceof PaymentsNotConfiguredError)
      return jsonError(
        StatusCodes.SERVICE_UNAVAILABLE,
        "PAYMENTS_NOT_CONFIGURED",
        "Payments are not configured. Set the Razorpay keys to take payments.",
      );
    return mapError(error);
  }
}
