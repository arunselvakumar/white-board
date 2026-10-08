import { DomainError, notFound } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";
import { PLAN_GRANTS, type PlanGrant } from "@/src/shared-kernel/plan";

import {
  quoteCheckout,
  type CheckoutChoice,
  type Quote,
} from "../domain/checkout";
import type { PlanCatalogue } from "../domain/plan";
import type { Subscription, SubscriptionStatus } from "../domain/subscription";
import {
  billingAddress,
  paidOrderTerms,
  type BillingAddress,
  type Seller,
  type SubscriptionOrder,
} from "../domain/subscription-order";
import { usageBars, type UsageBar } from "../domain/usage";
import type {
  InvoiceListParams,
  PaymentGateway,
  SubscriptionRepository,
  UsageReader,
  WebhookVerifier,
} from "./subscription-ports";

/** "Your Subscription" (CM-116). `owner` is null for a Member: no amounts. */
export type SubscriptionOverview = {
  planCode: string;
  planName: string;
  status: SubscriptionStatus;
  isTrial: boolean;
  startsAt: Date;
  endsAt: Date;
  daysLeft: number;
  autoRenew: boolean;
  usage: UsageBar[];
  addOns: { grant: PlanGrant; name: string; quantity: number }[];
  canManage: boolean;
  owner: {
    /** What an upgrade today would credit as the Last Plan Discount. */
    unusedValue: number;
    lastBillingAddress: BillingAddress | null;
    paymentsConfigured: boolean;
  } | null;
};

export type BillingAddressInput = {
  name: string;
  address: string;
  stateCode: string;
  gstin?: string | null;
};

export type CheckoutStarted = {
  order: SubscriptionOrder;
  gateway: { keyId: string; orderId: string; amount: number; currency: string };
};

export class PaymentsNotConfiguredError extends Error {
  constructor() {
    super("Payments are not configured.");
    this.name = "PaymentsNotConfiguredError";
  }
}

type WebhookEvent = {
  event?: unknown;
  payload?: {
    payment?: {
      entity?: { id?: unknown; order_id?: unknown; amount?: unknown };
    };
    order?: { entity?: { id?: unknown } };
  };
};

const text = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

/**
 * Plans, the Subscription read model, checkout and payment (CM-116,
 * CM-117). Routes check the Owner before checkout; the webhook carries no
 * Session and is trusted only through its signature.
 */
export class SubscriptionHandlers {
  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly usage: UsageReader,
    readonly catalogue: PlanCatalogue,
    private readonly gateway: PaymentGateway | null,
    private readonly webhookVerifier: WebhookVerifier,
    private readonly seller: Seller,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  get paymentsConfigured(): boolean {
    return this.gateway != null;
  }

  private async load(workspaceId: string): Promise<Subscription> {
    const subscription = await this.subscriptions.find(workspaceId);
    if (subscription == null)
      throw notFound(
        "SUBSCRIPTION_NOT_FOUND",
        "This Company has no subscription.",
      );
    return subscription;
  }

  async overview(
    workspaceId: string,
    viewer: { isOwner: boolean },
  ): Promise<SubscriptionOverview> {
    const now = this.clock();
    const subscription = await this.load(workspaceId);
    const usage = await this.usage.snapshot(workspaceId);
    const plan = this.catalogue.plan(subscription.planCode);
    const owner = viewer.isOwner
      ? {
          unusedValue: subscription.unusedValue(now),
          lastBillingAddress:
            await this.subscriptions.lastBillingAddress(workspaceId),
          paymentsConfigured: this.paymentsConfigured,
        }
      : null;
    return {
      planCode: plan.code,
      planName: plan.name,
      status: subscription.status(now),
      isTrial: subscription.isTrial,
      startsAt: subscription.startsAt,
      endsAt: subscription.endsAt,
      daysLeft: subscription.daysLeft(now),
      autoRenew: subscription.autoRenew,
      usage: usageBars(usage, subscription.limits(this.catalogue)),
      addOns: PLAN_GRANTS.flatMap((grant) => {
        const quantity = subscription.addOns[grant] ?? 0;
        const addOn = this.catalogue.addOn(grant);
        return quantity > 0 && addOn != null
          ? [{ grant, name: addOn.name, quantity }]
          : [];
      }),
      canManage: viewer.isOwner,
      owner,
    };
  }

  async quote(input: {
    workspaceId: string;
    choice: CheckoutChoice;
    stateCode: string;
  }): Promise<Quote> {
    return quoteCheckout({
      catalogue: this.catalogue,
      subscription: await this.load(input.workspaceId),
      choice: input.choice,
      buyerStateCode: input.stateCode,
      sellerStateCode: this.seller.stateCode,
      now: this.clock(),
    });
  }

  /** Prices the choice, opens a gateway order and stores the order (`created`). */
  async checkout(input: {
    workspaceId: string;
    by: string;
    choice: CheckoutChoice;
    billing: BillingAddressInput;
  }): Promise<CheckoutStarted> {
    if (this.gateway == null) throw new PaymentsNotConfiguredError();
    const now = this.clock();
    const billing = billingAddress(input.billing);
    const quote = await this.quote({
      workspaceId: input.workspaceId,
      choice: input.choice,
      stateCode: billing.stateCode,
    });
    const id = newId(now.getTime());
    const gatewayOrder = await this.gateway.createOrder(quote.total, id, {
      workspaceId: input.workspaceId,
      orderId: id,
      kind: quote.kind,
      plan: quote.planCode,
    });
    if (gatewayOrder.amount !== quote.total)
      throw new Error("The payment gateway changed the order amount.");
    const order: SubscriptionOrder = {
      id,
      workspaceId: input.workspaceId,
      quote,
      billing,
      seller: this.seller,
      gateway: "razorpay",
      gatewayOrderId: gatewayOrder.id,
      gatewayPaymentId: null,
      status: "created",
      invoiceNumber: null,
      createdBy: input.by,
      createdAt: now,
      paidAt: null,
      failedAt: null,
    };
    await this.subscriptions.createOrder(order, {
      workspaceId: input.workspaceId,
      actorUserId: input.by,
      action: "subscription.order_created",
      entityType: "subscription_order",
      entityId: id,
      after: {
        kind: quote.kind,
        planCode: quote.planCode,
        months: quote.months,
        addOns: quote.addOns,
        total: quote.total,
        gatewayOrderId: gatewayOrder.id,
      },
      occurredAt: now,
    });
    return {
      order,
      gateway: {
        keyId: this.gateway.keyId,
        orderId: gatewayOrder.id,
        amount: gatewayOrder.amount,
        currency: gatewayOrder.currency,
      },
    };
  }

  private async settle(
    gatewayOrderId: string,
    gatewayPaymentId: string,
  ): Promise<"paid" | "already_paid" | "not_found"> {
    const paidAt = this.clock();
    return this.subscriptions.settle({
      gatewayOrderId,
      gatewayPaymentId,
      paidAt,
      apply: (order, current) =>
        current.afterPayment(paidOrderTerms(order), paidAt),
    });
  }

  /**
   * Checkout's success callback (immediate feedback). The signature proves
   * the payment, so the order is settled here too; the webhook settles it
   * otherwise, and whichever comes second changes nothing.
   */
  async verify(input: {
    workspaceId: string;
    gatewayOrderId: string;
    gatewayPaymentId: string;
    signature: string;
  }): Promise<SubscriptionOrder> {
    const order = await this.subscriptions.findOrderByGatewayId(
      input.gatewayOrderId,
    );
    if (order?.workspaceId !== input.workspaceId)
      throw notFound("ORDER_NOT_FOUND", "This order was not found.");
    const signed = this.gateway?.verifyPaymentSignature({
      orderId: input.gatewayOrderId,
      paymentId: input.gatewayPaymentId,
      signature: input.signature,
    });
    if (signed !== true)
      throw new DomainError(
        "PAYMENT_SIGNATURE_INVALID",
        "We could not confirm this payment. If money was taken, it will be confirmed shortly.",
      );
    await this.settle(input.gatewayOrderId, input.gatewayPaymentId);
    const settled = await this.subscriptions.findOrderByGatewayId(
      input.gatewayOrderId,
    );
    return settled ?? order;
  }

  /**
   * Razorpay webhook: `payment.captured` and `order.paid` settle the order
   * (idempotently), `payment.failed` marks it failed. Returns false when
   * the signature is wrong; other events are acknowledged and ignored.
   */
  async webhook(input: {
    rawBody: string;
    signature: string | null;
  }): Promise<{ verified: boolean; result: string }> {
    if (!this.webhookVerifier.verify(input.rawBody, input.signature))
      return { verified: false, result: "rejected" };
    let event: WebhookEvent;
    try {
      event = JSON.parse(input.rawBody) as WebhookEvent;
    } catch {
      return { verified: true, result: "ignored" };
    }
    const payment = event.payload?.payment?.entity;
    const gatewayOrderId =
      text(payment?.order_id) ?? text(event.payload?.order?.entity?.id);
    const paymentId = text(payment?.id);
    if (gatewayOrderId == null) return { verified: true, result: "ignored" };
    switch (event.event) {
      case "payment.captured":
      case "order.paid": {
        if (paymentId == null) return { verified: true, result: "ignored" };
        const order =
          await this.subscriptions.findOrderByGatewayId(gatewayOrderId);
        if (order == null) return { verified: true, result: "not_found" };
        if (
          typeof payment?.amount === "number" &&
          payment.amount !== order.quote.total
        )
          return { verified: true, result: "amount_mismatch" };
        return {
          verified: true,
          result: await this.settle(gatewayOrderId, paymentId),
        };
      }
      case "payment.failed":
        await this.subscriptions.markFailed(gatewayOrderId, this.clock());
        return { verified: true, result: "failed" };
      default:
        return { verified: true, result: "ignored" };
    }
  }

  invoices(params: InvoiceListParams) {
    return this.subscriptions.listInvoices(params);
  }

  async invoice(workspaceId: string, id: string): Promise<SubscriptionOrder> {
    const order = await this.subscriptions.findInvoice(workspaceId, id);
    if (order == null)
      throw notFound("INVOICE_NOT_FOUND", "This invoice was not found.");
    return order;
  }
}
