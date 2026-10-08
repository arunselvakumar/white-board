import { DomainError } from "@/src/shared-kernel/domain-error";
import { PLAN_GRANTS, type PlanGrant } from "@/src/shared-kernel/plan";

import type { AddOnQuantities, PlanCatalogue } from "./plan";
import { addMonths, prorate, type Subscription } from "./subscription";

/**
 * What an order buys (`modules/01` workflows 14–15):
 * - `new`: a Plan from a Trial or an ended Plan;
 * - `extend`: more months of the running Plan, added to its end;
 * - `upgrade`: the same or a higher Plan, starting now, with the unused
 *   value of the running Plan as the Last Plan Discount;
 * - `add_ons`: more add-ons on the running Plan for the days it has left.
 */
export const ORDER_KINDS = ["new", "extend", "upgrade", "add_ons"] as const;
export type OrderKind = (typeof ORDER_KINDS)[number];

/** GST on the subscription, shown separately on the order and invoice. */
export const GST_RATE_PERCENT = 18;
/** Add-ons on a running Plan are charged per day as 1/30 of a month. */
export const DAYS_PER_MONTH = 30;

export type CheckoutChoice = {
  kind: OrderKind;
  /** Required for `new` and `upgrade`; the running Plan otherwise. */
  planCode?: string | null;
  /** Required for `new`, `extend` and `upgrade`. */
  months?: number | null;
  /** Units per add-on; for `extend` the running add-ons are renewed instead. */
  addOns?: AddOnQuantities;
};

export type QuoteLine = {
  /** `plan` or the add-on's grant. */
  item: "plan" | PlanGrant;
  description: string;
  /** Plan price for the duration, or add-on price per unit per month. */
  rate: number;
  quantity: number;
  months: number | null;
  /** Add-ons on a running Plan: days charged. */
  days: number | null;
  amount: number;
};

export type Tax = { cgst: number; sgst: number; igst: number };

/**
 * The Order Summary (Rate, Amount, Sub Total, Last Plan Discount, GST,
 * Total), all paise. Stored on the order as its price snapshot.
 */
export type Quote = {
  kind: OrderKind;
  planCode: string;
  planName: string;
  months: number | null;
  days: number | null;
  addOns: AddOnQuantities;
  lines: QuoteLine[];
  subTotal: number;
  lastPlanDiscount: number;
  taxableAmount: number;
  tax: Tax;
  total: number;
  currency: string;
  catalogueVersion: number;
  /** The period the Plan runs for if paid now. */
  startsAt: Date;
  endsAt: Date;
};

/** CGST + SGST inside the seller's state, IGST across states. */
export function gstOn(
  taxable: number,
  buyerStateCode: string,
  sellerStateCode: string,
): Tax {
  if (buyerStateCode === sellerStateCode) {
    const half = prorate(taxable, GST_RATE_PERCENT, 200);
    return { cgst: half, sgst: half, igst: 0 };
  }
  return { cgst: 0, sgst: 0, igst: prorate(taxable, GST_RATE_PERCENT, 100) };
}

function notAllowed(message: string): DomainError {
  return new DomainError("CHECKOUT_NOT_ALLOWED", message, { kind: "conflict" });
}

/** Prices a checkout choice against the Company's Subscription now. */
export function quoteCheckout(input: {
  catalogue: PlanCatalogue;
  subscription: Subscription;
  choice: CheckoutChoice;
  buyerStateCode: string;
  sellerStateCode: string;
  now: Date;
}): Quote {
  const { catalogue, subscription, choice, now } = input;
  const status = subscription.status(now);
  const lines: QuoteLine[] = [];
  let planCode = subscription.planCode;
  let months: number | null = null;
  let days: number | null = null;
  let addOns: AddOnQuantities = {};
  let lastPlanDiscount = 0;
  let startsAt = now;
  let endsAt = subscription.endsAt;

  const addPlanLine = (code: string, wanted: number | null | undefined) => {
    const plan = catalogue.plan(code);
    if (wanted == null)
      throw new DomainError("DURATION_REQUIRED", "Choose a duration.");
    const duration = catalogue.duration(plan, wanted);
    lines.push({
      item: "plan",
      description: `${plan.name} plan, ${String(duration.months)} months`,
      rate: duration.pricePaise,
      quantity: 1,
      months: duration.months,
      days: null,
      amount: duration.pricePaise,
    });
    return duration.months;
  };
  const addMonthlyAddOns = (quantities: AddOnQuantities, forMonths: number) => {
    for (const grant of PLAN_GRANTS) {
      const quantity = quantities[grant] ?? 0;
      const addOn = catalogue.addOn(grant);
      if (quantity === 0 || addOn == null) continue;
      lines.push({
        item: grant,
        description: addOn.name,
        rate: addOn.pricePerUnitPerMonthPaise,
        quantity,
        months: forMonths,
        days: null,
        amount: addOn.pricePerUnitPerMonthPaise * quantity * forMonths,
      });
    }
  };

  switch (choice.kind) {
    case "new": {
      if (status === "active")
        throw notAllowed(
          "Your plan is running. Extend it, upgrade it, or buy add-ons.",
        );
      planCode = choice.planCode ?? "";
      months = addPlanLine(planCode, choice.months);
      addOns = catalogue.addOnQuantities(choice.addOns ?? {});
      addMonthlyAddOns(addOns, months);
      endsAt = addMonths(now, months);
      break;
    }
    case "extend": {
      if (status !== "active")
        throw notAllowed(
          "Choose a plan first; there is no paid plan to extend.",
        );
      if (choice.planCode != null && choice.planCode !== subscription.planCode)
        throw notAllowed("Extending keeps your plan. Upgrade to change it.");
      months = addPlanLine(planCode, choice.months);
      addOns = subscription.addOns;
      addMonthlyAddOns(addOns, months);
      startsAt = subscription.endsAt;
      endsAt = addMonths(subscription.endsAt, months);
      break;
    }
    case "upgrade": {
      if (status !== "active")
        throw notAllowed(
          "Choose a plan first; there is no paid plan to upgrade.",
        );
      planCode = choice.planCode ?? "";
      const current = catalogue.plan(subscription.planCode);
      if (catalogue.plan(planCode).rank < current.rank)
        throw new DomainError(
          "PLAN_DOWNGRADE_NOT_ALLOWED",
          "The new plan must be the same as your plan or higher.",
          { kind: "conflict" },
        );
      months = addPlanLine(planCode, choice.months);
      addOns = catalogue.addOnQuantities(choice.addOns ?? {});
      addMonthlyAddOns(addOns, months);
      lastPlanDiscount = subscription.unusedValue(now);
      endsAt = addMonths(now, months);
      break;
    }
    case "add_ons": {
      if (status !== "active")
        throw notAllowed("Add-ons need a paid plan. Choose a plan first.");
      addOns = catalogue.addOnQuantities(choice.addOns ?? {});
      days = subscription.daysLeft(now);
      for (const grant of PLAN_GRANTS) {
        const quantity = addOns[grant] ?? 0;
        const addOn = catalogue.addOn(grant);
        if (quantity === 0 || addOn == null) continue;
        lines.push({
          item: grant,
          description: addOn.name,
          rate: addOn.pricePerUnitPerMonthPaise,
          quantity,
          months: null,
          days,
          amount: prorate(
            addOn.pricePerUnitPerMonthPaise * quantity,
            days,
            DAYS_PER_MONTH,
          ),
        });
      }
      if (lines.length === 0)
        throw new DomainError(
          "ADD_ONS_REQUIRED",
          "Choose at least one add-on.",
        );
      startsAt = now;
      break;
    }
  }

  const subTotal = lines.reduce((sum, line) => sum + line.amount, 0);
  lastPlanDiscount = Math.min(lastPlanDiscount, subTotal);
  const taxableAmount = subTotal - lastPlanDiscount;
  if (taxableAmount <= 0)
    throw notAllowed("There is nothing to pay for this choice.");
  const tax = gstOn(taxableAmount, input.buyerStateCode, input.sellerStateCode);
  return {
    kind: choice.kind,
    planCode,
    planName: catalogue.plan(planCode).name,
    months,
    days,
    addOns,
    lines,
    subTotal,
    lastPlanDiscount,
    taxableAmount,
    tax,
    total: taxableAmount + tax.cgst + tax.sgst + tax.igst,
    currency: catalogue.currency,
    catalogueVersion: catalogue.version,
    startsAt,
    endsAt,
  };
}
