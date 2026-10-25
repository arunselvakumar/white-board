import type {
  PaymentGateway,
  WebhookVerifier,
} from "../application/subscription-ports";
import { FakePaymentGateway } from "./fake-payment-gateway";
import { RazorpayGateway, RazorpayWebhookVerifier } from "./razorpay";

/** The key id that selects the in-process fake gateway (end-to-end tests). */
export const FAKE_GATEWAY_KEY_ID = "rzp_test_fake";

/**
 * Razorpay from `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`, or null when
 * they are not set: checkout then shows "Payments are not configured".
 * The key id `rzp_test_fake` selects the fake gateway for end-to-end tests
 * (ADR CM-0031); Vercel (previews included) and live production refuse it.
 */
export function paymentGatewayFromEnv(): PaymentGateway | null {
  const keyId = process.env["RAZORPAY_KEY_ID"] ?? "";
  const keySecret = process.env["RAZORPAY_KEY_SECRET"] ?? "";
  if (keyId === "" || keySecret === "") return null;
  if (keyId === FAKE_GATEWAY_KEY_ID) {
    if (
      process.env["VERCEL"] === "1" ||
      (process.env.NODE_ENV === "production" &&
        process.env["VERCEL_ENV"] !== "preview")
    )
      throw new Error(
        "The fake payment gateway must not run on Vercel or in live production.",
      );
    return new FakePaymentGateway(keySecret);
  }
  return new RazorpayGateway(keyId, keySecret);
}

/** Without `RAZORPAY_WEBHOOK_SECRET` every webhook is rejected. */
export function webhookVerifierFromEnv(): WebhookVerifier {
  return new RazorpayWebhookVerifier(
    process.env["RAZORPAY_WEBHOOK_SECRET"] ?? "",
  );
}
