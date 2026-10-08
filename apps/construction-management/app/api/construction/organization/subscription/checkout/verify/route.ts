import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import {
  isResponse,
  requireOwnerSession,
} from "@/app/api/_lib/require-session";
import { createSubscriptionHandlers } from "@/src/organization/infrastructure/create-subscription-handlers";

import { VerifyConstructionOrganizationCheckoutRequestModel } from "./verify-checkout-request-model";
import type { VerifyConstructionOrganizationCheckoutResponseModel } from "./verify-checkout-response-model";

export const dynamic = "force-dynamic";

const handlers = createSubscriptionHandlers();

/**
 * Checkout's success callback (CM-117): checks `razorpay_signature` (HMAC
 * of `order_id|payment_id` with the key secret) and settles the order for
 * immediate feedback. The webhook settles it too; the second is a no-op.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireOwnerSession(request);
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      VerifyConstructionOrganizationCheckoutRequestModel.safeParse(
        await request.json(),
      ),
    );
    const order = await handlers.verify({
      workspaceId: session.workspaceId,
      gatewayOrderId: model.razorpayOrderId,
      gatewayPaymentId: model.razorpayPaymentId,
      signature: model.razorpaySignature,
    });
    const body: VerifyConstructionOrganizationCheckoutResponseModel = {
      orderId: order.id,
      status: order.status,
      invoiceNumber: order.invoiceNumber,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
