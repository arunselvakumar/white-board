import { Prisma, type PrismaClient } from "@repo/construction-db";

import { recordAudit, type AuditEvent } from "@/src/shared-kernel/audit";
import { PLAN_GRANTS, type PlanGrant } from "@/src/shared-kernel/plan";

import type {
  InvoiceListParams,
  SettleResult,
  SubscriptionRepository,
} from "../application/subscription-ports";
import type { OrderKind, QuoteLine } from "../domain/checkout";
import type { AddOnQuantities } from "../domain/plan";
import { Subscription } from "../domain/subscription";
import {
  fiscalYearOf,
  invoiceNumber,
  type BillingAddress,
  type Seller,
  type SubscriptionOrder,
} from "../domain/subscription-order";

type SubscriptionRow =
  Prisma.ConstructionOrganizationSubscriptionGetPayload<object>;
type OrderRow =
  Prisma.ConstructionOrganizationSubscriptionOrderGetPayload<object>;

const PAID_ACTIONS: Record<OrderKind, string> = {
  new: "subscription.activated",
  extend: "subscription.extended",
  upgrade: "subscription.upgraded",
  add_ons: "subscription.add_ons_bought",
};

function toAddOns(value: unknown): AddOnQuantities {
  const result: Partial<Record<PlanGrant, number>> = {};
  if (value == null || typeof value !== "object") return result;
  const record = value as Record<string, unknown>;
  for (const grant of PLAN_GRANTS) {
    const quantity = record[grant];
    if (typeof quantity === "number" && quantity > 0) result[grant] = quantity;
  }
  return result;
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function toSubscription(row: SubscriptionRow): Subscription {
  return new Subscription(
    row.id,
    row.workspaceId,
    row.planCode,
    row.startsAt,
    row.endsAt,
    row.autoRenew,
    toAddOns(row.addOns),
    row.paidValue,
  );
}

function toOrder(row: OrderRow): SubscriptionOrder {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    quote: {
      kind: row.kind,
      planCode: row.planCode,
      planName: row.planName,
      months: row.months,
      days: row.days,
      addOns: toAddOns(row.addOns),
      lines: row.lines as QuoteLine[],
      subTotal: row.subTotal,
      lastPlanDiscount: row.lastPlanDiscount,
      taxableAmount: row.taxableAmount,
      tax: { cgst: row.cgst, sgst: row.sgst, igst: row.igst },
      total: row.total,
      currency: row.currency,
      catalogueVersion: row.catalogueVersion,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
    },
    billing: {
      name: row.billingName,
      address: row.billingAddress,
      stateCode: row.billingStateCode,
      gstin: row.billingGstin,
    },
    seller: row.seller as Seller,
    gateway: "razorpay",
    gatewayOrderId: row.gatewayOrderId,
    gatewayPaymentId: row.gatewayPaymentId,
    status: row.status,
    invoiceNumber: row.invoiceNumber,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    paidAt: row.paidAt,
    failedAt: row.failedAt,
  };
}

export class PrismaSubscriptionRepository implements SubscriptionRepository {
  constructor(private readonly db: PrismaClient) {}

  async find(workspaceId: string): Promise<Subscription | null> {
    const row = await this.db.constructionOrganizationSubscription.findUnique({
      where: { workspaceId },
    });
    return row == null ? null : toSubscription(row);
  }

  async createOrder(
    order: SubscriptionOrder,
    audit: AuditEvent,
  ): Promise<void> {
    const { quote, billing } = order;
    await this.db.$transaction(async (tx) => {
      await tx.constructionOrganizationSubscriptionOrder.create({
        data: {
          id: order.id,
          workspaceId: order.workspaceId,
          kind: quote.kind,
          planCode: quote.planCode,
          planName: quote.planName,
          months: quote.months,
          days: quote.days,
          addOns: json(quote.addOns),
          lines: json(quote.lines),
          catalogueVersion: quote.catalogueVersion,
          currency: quote.currency,
          subTotal: quote.subTotal,
          lastPlanDiscount: quote.lastPlanDiscount,
          taxableAmount: quote.taxableAmount,
          cgst: quote.tax.cgst,
          sgst: quote.tax.sgst,
          igst: quote.tax.igst,
          total: quote.total,
          startsAt: quote.startsAt,
          endsAt: quote.endsAt,
          billingName: billing.name,
          billingAddress: billing.address,
          billingStateCode: billing.stateCode,
          billingGstin: billing.gstin,
          seller: json(order.seller),
          gateway: order.gateway,
          gatewayOrderId: order.gatewayOrderId,
          status: order.status,
          createdBy: order.createdBy,
          createdAt: order.createdAt,
        },
      });
      await recordAudit(tx, audit);
    });
  }

  async findOrderByGatewayId(
    gatewayOrderId: string,
  ): Promise<SubscriptionOrder | null> {
    const row =
      await this.db.constructionOrganizationSubscriptionOrder.findUnique({
        where: { gatewayOrderId },
      });
    return row == null ? null : toOrder(row);
  }

  async settle(input: {
    gatewayOrderId: string;
    gatewayPaymentId: string;
    paidAt: Date;
    apply: (
      order: SubscriptionOrder,
      current: Subscription | null,
    ) => Subscription;
  }): Promise<SettleResult> {
    return this.db.$transaction(async (tx) => {
      // Row locks serialise the webhook and the checkout callback.
      const locked = await tx.$queryRaw<{ id: string; status: string }[]>(
        Prisma.sql`SELECT id, status::text AS status
          FROM construction_organization.subscription_orders
          WHERE gateway_order_id = ${input.gatewayOrderId}
          FOR UPDATE`,
      );
      const lockedOrder = locked[0];
      if (lockedOrder == null) return "not_found";
      if (lockedOrder.status === "paid") return "already_paid";
      const order = toOrder(
        await tx.constructionOrganizationSubscriptionOrder.findUniqueOrThrow({
          where: { id: lockedOrder.id },
        }),
      );
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM construction_organization.subscriptions
          WHERE workspace_id = ${order.workspaceId} FOR UPDATE`,
      );
      // No row before the Company's first plan: `apply` starts one. Two
      // first payments at once collide on the unique workspace id, and the
      // loser's transaction rolls back for the gateway to retry.
      const row = await tx.constructionOrganizationSubscription.findUnique({
        where: { workspaceId: order.workspaceId },
      });
      const before = row == null ? null : toSubscription(row);
      const after = input.apply(order, before);
      const data = {
        planCode: after.planCode,
        startsAt: after.startsAt,
        endsAt: after.endsAt,
        addOns: json(after.addOns),
        paidValue: after.paidValue,
      };
      if (row == null)
        await tx.constructionOrganizationSubscription.create({
          data: {
            id: after.id,
            workspaceId: after.workspaceId,
            autoRenew: after.autoRenew,
            ...data,
          },
        });
      else
        await tx.constructionOrganizationSubscription.update({
          where: { id: row.id },
          data,
        });
      const fiscalYear = fiscalYearOf(input.paidAt);
      const counter = await tx.$queryRaw<{ last_number: number }[]>(
        Prisma.sql`INSERT INTO construction_organization.subscription_invoice_counters (fiscal_year, last_number)
          VALUES (${fiscalYear}, 1)
          ON CONFLICT (fiscal_year) DO UPDATE
            SET last_number = construction_organization.subscription_invoice_counters.last_number + 1
          RETURNING last_number`,
      );
      await tx.constructionOrganizationSubscriptionOrder.update({
        where: { id: order.id },
        data: {
          status: "paid",
          gatewayPaymentId: input.gatewayPaymentId,
          paidAt: input.paidAt,
          invoiceNumber: invoiceNumber(
            fiscalYear,
            counter[0]?.last_number ?? 1,
          ),
        },
      });
      const view = (subscription: Subscription) => ({
        planCode: subscription.planCode,
        startsAt: subscription.startsAt,
        endsAt: subscription.endsAt,
        addOns: subscription.addOns,
      });
      await recordAudit(tx, {
        workspaceId: order.workspaceId,
        actorUserId: order.createdBy,
        action: PAID_ACTIONS[order.quote.kind],
        entityType: "subscription",
        entityId: after.id,
        before: before == null ? null : view(before),
        after: { ...view(after), orderId: order.id },
        occurredAt: input.paidAt,
      });
      return "paid";
    });
  }

  async markFailed(gatewayOrderId: string, at: Date): Promise<void> {
    await this.db.constructionOrganizationSubscriptionOrder.updateMany({
      where: { gatewayOrderId, status: "created" },
      data: { status: "failed", failedAt: at },
    });
  }

  async listInvoices(params: InvoiceListParams) {
    const base: Prisma.ConstructionOrganizationSubscriptionOrderWhereInput = {
      workspaceId: params.workspaceId,
      status: "paid",
    };
    // Newest first; `after` pages forward (older), `before` pages back.
    const backwards = params.before != null;
    const cursor = params.after ?? params.before;
    const page =
      await this.db.constructionOrganizationSubscriptionOrder.findMany({
        where:
          cursor == null
            ? base
            : {
                AND: [
                  base,
                  {
                    OR: backwards
                      ? [
                          { paidAt: { gt: cursor.paidAt } },
                          { paidAt: cursor.paidAt, id: { gt: cursor.id } },
                        ]
                      : [
                          { paidAt: { lt: cursor.paidAt } },
                          { paidAt: cursor.paidAt, id: { lt: cursor.id } },
                        ],
                  },
                ],
              },
        orderBy: backwards
          ? [{ paidAt: "asc" }, { id: "asc" }]
          : [{ paidAt: "desc" }, { id: "desc" }],
        take: params.limit + 1,
      });
    const hasMore = page.length > params.limit;
    const rows = page.slice(0, params.limit);
    if (backwards) rows.reverse();
    const total = await this.db.constructionOrganizationSubscriptionOrder.count(
      {
        where: base,
      },
    );
    return { items: rows.map(toOrder), total, hasMore };
  }

  async findInvoice(
    workspaceId: string,
    id: string,
  ): Promise<SubscriptionOrder | null> {
    const row =
      await this.db.constructionOrganizationSubscriptionOrder.findFirst({
        where: { id, workspaceId, status: "paid" },
      });
    return row == null ? null : toOrder(row);
  }

  async lastBillingAddress(
    workspaceId: string,
  ): Promise<BillingAddress | null> {
    const row =
      await this.db.constructionOrganizationSubscriptionOrder.findFirst({
        where: { workspaceId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          billingName: true,
          billingAddress: true,
          billingStateCode: true,
          billingGstin: true,
        },
      });
    return row == null
      ? null
      : {
          name: row.billingName,
          address: row.billingAddress,
          stateCode: row.billingStateCode,
          gstin: row.billingGstin,
        };
  }
}
