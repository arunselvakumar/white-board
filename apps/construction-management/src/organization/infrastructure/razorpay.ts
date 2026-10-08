import { createHmac, timingSafeEqual } from "node:crypto";

import type {
  GatewayOrder,
  PaymentGateway,
  WebhookVerifier,
} from "../application/subscription-ports";

/** Hex HMAC-SHA256, as Razorpay signs checkout callbacks and webhooks. */
export function razorpaySignature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/** Constant-time comparison of a received signature with the expected one. */
export function signatureMatches(
  payload: string,
  secret: string,
  received: string | null,
): boolean {
  if (received == null || secret.length === 0) return false;
  const expected = Buffer.from(razorpaySignature(payload, secret), "utf8");
  const actual = Buffer.from(received.trim(), "utf8");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** `X-Razorpay-Signature`: HMAC of the raw body with the webhook secret. */
export class RazorpayWebhookVerifier implements WebhookVerifier {
  constructor(private readonly secret: string) {}

  verify(rawBody: string, signature: string | null): boolean {
    return signatureMatches(rawBody, this.secret, signature);
  }
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/**
 * Razorpay Orders API (https://razorpay.com/docs/api/orders/) with basic
 * auth `key_id:key_secret`. Test-mode keys (`rzp_test_…`) take no money.
 */
export class RazorpayGateway implements PaymentGateway {
  constructor(
    readonly keyId: string,
    private readonly keySecret: string,
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
  ) {}

  async createOrder(
    amountPaise: number,
    receipt: string,
    notes: Record<string, string>,
  ): Promise<GatewayOrder> {
    const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString(
      "base64",
    );
    const response = await this.fetchImpl(
      "https://api.razorpay.com/v1/orders",
      {
        method: "POST",
        headers: {
          authorization: `Basic ${auth}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          amount: amountPaise,
          currency: "INR",
          receipt,
          notes,
        }),
      },
    );
    if (!response.ok)
      throw new Error(
        `Razorpay order failed: ${String(response.status)} ${await response.text()}`,
      );
    const body = (await response.json()) as {
      id: string;
      amount: number;
      currency: string;
    };
    return { id: body.id, amount: body.amount, currency: body.currency };
  }

  verifyPaymentSignature(input: {
    orderId: string;
    paymentId: string;
    signature: string;
  }): boolean {
    return signatureMatches(
      `${input.orderId}|${input.paymentId}`,
      this.keySecret,
      input.signature,
    );
  }
}
