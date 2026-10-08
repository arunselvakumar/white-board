import type {
  GatewayOrder,
  PaymentGateway,
} from "../application/subscription-ports";
import { razorpaySignature, signatureMatches } from "./razorpay";

/**
 * A Razorpay stand-in for tests: orders get ids `order_fake_<n>` and
 * payments are signed with `keySecret` exactly as Razorpay signs them.
 */
export class FakePaymentGateway implements PaymentGateway {
  readonly keyId = "rzp_test_fake";
  readonly orders: (GatewayOrder & {
    receipt: string;
    notes: Record<string, string>;
  })[] = [];

  constructor(readonly keySecret = "fake-key-secret") {}

  createOrder(
    amountPaise: number,
    receipt: string,
    notes: Record<string, string>,
  ): Promise<GatewayOrder> {
    const order = {
      id: `order_fake_${String(Date.now())}${String(this.orders.length)}`,
      amount: amountPaise,
      currency: "INR",
      receipt,
      notes,
    };
    this.orders.push(order);
    return Promise.resolve({
      id: order.id,
      amount: order.amount,
      currency: order.currency,
    });
  }

  /** What checkout would hand the browser after a successful payment. */
  sign(orderId: string, paymentId: string): string {
    return razorpaySignature(`${orderId}|${paymentId}`, this.keySecret);
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
