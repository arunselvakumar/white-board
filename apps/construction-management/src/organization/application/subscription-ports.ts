import type { AuditEvent } from "@/src/shared-kernel/audit";
import type { PlanGrant } from "@/src/shared-kernel/plan";

import type { Subscription } from "../domain/subscription";
import type {
  BillingAddress,
  SubscriptionOrder,
} from "../domain/subscription-order";
import type { UsageSnapshot } from "../domain/usage";

export type SettleResult = "paid" | "already_paid" | "not_found";

export type InvoiceListParams = {
  workspaceId: string;
  limit: number;
  after?: { paidAt: Date; id: string };
  before?: { paidAt: Date; id: string };
};

export type SubscriptionRepository = {
  find(workspaceId: string): Promise<Subscription | null>;
  createOrder(order: SubscriptionOrder, audit: AuditEvent): Promise<void>;
  findOrderByGatewayId(
    gatewayOrderId: string,
  ): Promise<SubscriptionOrder | null>;
  /**
   * Marks the order paid and applies it to the Subscription in one
   * transaction, with both rows locked; gives it the next invoice number.
   * `current` is null for the Company's first plan, and the row `apply`
   * returns is created. An order already paid is left alone (webhook
   * replays, verify + webhook).
   */
  settle(input: {
    gatewayOrderId: string;
    gatewayPaymentId: string;
    paidAt: Date;
    apply: (
      order: SubscriptionOrder,
      current: Subscription | null,
    ) => Subscription;
  }): Promise<SettleResult>;
  /** A failed payment attempt; a later attempt on the same order may still pay it. */
  markFailed(gatewayOrderId: string, at: Date): Promise<void>;
  listInvoices(params: InvoiceListParams): Promise<{
    items: SubscriptionOrder[];
    total: number;
    hasMore: boolean;
  }>;
  findInvoice(
    workspaceId: string,
    id: string,
  ): Promise<SubscriptionOrder | null>;
  /** The buyer details of the Company's newest order, to pre-fill checkout. */
  lastBillingAddress(workspaceId: string): Promise<BillingAddress | null>;
};

/** Counts behind the usage bars and the plan limits (CM-116, CM-118). */
export type UsageReader = {
  count(workspaceId: string, grant: PlanGrant): Promise<number>;
  snapshot(workspaceId: string): Promise<UsageSnapshot>;
};

export type GatewayOrder = { id: string; amount: number; currency: string };

/** The payment gateway (Razorpay) behind a port, so tests use a fake. */
export type PaymentGateway = {
  /** Public key id the browser checkout opens with. */
  readonly keyId: string;
  createOrder(
    amountPaise: number,
    receipt: string,
    notes: Record<string, string>,
  ): Promise<GatewayOrder>;
  /** Checkout's `razorpay_signature`: HMAC of `order_id|payment_id`. */
  verifyPaymentSignature(input: {
    orderId: string;
    paymentId: string;
    signature: string;
  }): boolean;
};

/** Checks `X-Razorpay-Signature` over the raw webhook body. */
export type WebhookVerifier = {
  verify(rawBody: string, signature: string | null): boolean;
};
