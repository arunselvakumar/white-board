import { StatusCodes } from "http-status-codes";

import { jsonError } from "@/app/api/_lib/json-error";
import { mapError } from "@/app/api/_lib/map-error";
import { createSubscriptionHandlers } from "@/src/organization/infrastructure/create-subscription-handlers";

import type { ReceiveConstructionOrganizationRazorpayWebhookResponseModel } from "./razorpay-webhook-response-model";

export const dynamic = "force-dynamic";

const handlers = createSubscriptionHandlers();

/**
 * Razorpay webhook (CM-117), the source of truth for payments. No Session:
 * `X-Razorpay-Signature` (HMAC-SHA256 of the raw body with
 * `RAZORPAY_WEBHOOK_SECRET`) must match, or 401. `payment.captured` and
 * `order.paid` settle the order once; replays change nothing and get 200.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const rawBody = await request.text();
    const outcome = await handlers.webhook({
      rawBody,
      signature: request.headers.get("x-razorpay-signature"),
    });
    if (!outcome.verified)
      return jsonError(
        StatusCodes.UNAUTHORIZED,
        "WEBHOOK_SIGNATURE_INVALID",
        "The webhook signature does not match.",
      );
    const body: ReceiveConstructionOrganizationRazorpayWebhookResponseModel = {
      received: true,
      result: outcome.result,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
