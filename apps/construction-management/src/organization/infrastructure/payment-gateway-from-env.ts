import type {
  PaymentGateway,
  WebhookVerifier,
} from "../application/subscription-ports";
import { RazorpayGateway, RazorpayWebhookVerifier } from "./razorpay";

/**
 * Razorpay from `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`, or null when
 * they are not set: checkout then shows "Payments are not configured".
 */
export function paymentGatewayFromEnv(): PaymentGateway | null {
  const keyId = process.env["RAZORPAY_KEY_ID"] ?? "";
  const keySecret = process.env["RAZORPAY_KEY_SECRET"] ?? "";
  if (keyId === "" || keySecret === "") return null;
  return new RazorpayGateway(keyId, keySecret);
}

/** Without `RAZORPAY_WEBHOOK_SECRET` every webhook is rejected. */
export function webhookVerifierFromEnv(): WebhookVerifier {
  return new RazorpayWebhookVerifier(
    process.env["RAZORPAY_WEBHOOK_SECRET"] ?? "",
  );
}
