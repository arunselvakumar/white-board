import { PLAN_GRANTS, type PlanGrant } from "@/src/shared-kernel/plan";

import type { AddOnQuantities, PlanCatalogue } from "./plan";

export const DAY_MS = 24 * 60 * 60 * 1000;

export type SubscriptionStatus = "active" | "expired";

/** A Company's plan status: `none` until its first plan is paid for. */
export type PlanStatus = SubscriptionStatus | "none";

/** Calendar months later, in UTC; 31 January + 1 month is 28/29 February. */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

/** `amount × numerator / denominator`, rounded half up to the paisa. */
export function prorate(
  amount: number,
  numerator: number,
  denominator: number,
): number {
  if (denominator <= 0) return 0;
  const a = BigInt(amount) * BigInt(numerator) * 2n;
  const d = BigInt(denominator) * 2n;
  return Number((a + d / 2n) / d);
}

/** What a paid order changes, from its price snapshot. */
export type PaidOrderTerms = {
  kind: "new" | "extend" | "upgrade" | "add_ons";
  planCode: string;
  months: number | null;
  addOns: AddOnQuantities;
  /** Pre-GST value of what was bought (Sub Total). */
  subTotal: number;
};

/**
 * A Company's current Plan, until when, and its add-ons (CM-116). At most
 * one per Company, made by its first paid order; a Company without one has
 * no plan and no limits. Status is derived from the dates, never stored.
 */
export class Subscription {
  constructor(
    readonly id: string,
    readonly workspaceId: string,
    readonly planCode: string,
    readonly startsAt: Date,
    readonly endsAt: Date,
    readonly autoRenew: boolean,
    readonly addOns: AddOnQuantities,
    /**
     * Pre-GST value paid for the period `startsAt`–`endsAt`; its unused
     * share is the Last Plan Discount on an upgrade.
     */
    readonly paidValue: number,
  ) {}

  /** The Subscription a Company's first paid order (`new`) starts. */
  static started(input: {
    id: string;
    workspaceId: string;
    terms: PaidOrderTerms;
    paidAt: Date;
  }): Subscription {
    const { terms, paidAt } = input;
    if (terms.kind !== "new")
      throw new Error("Only a new plan can start a Subscription.");
    return new Subscription(
      input.id,
      input.workspaceId,
      terms.planCode,
      paidAt,
      addMonths(paidAt, terms.months ?? 0),
      false,
      terms.addOns,
      terms.subTotal,
    );
  }

  status(now: Date): SubscriptionStatus {
    return now.getTime() >= this.endsAt.getTime() ? "expired" : "active";
  }

  hasEnded(now: Date): boolean {
    return this.status(now) === "expired";
  }

  /** Whole days left, counting a part day as a day; 0 once ended. */
  daysLeft(now: Date): number {
    const left = this.endsAt.getTime() - now.getTime();
    return left <= 0 ? 0 : Math.ceil(left / DAY_MS);
  }

  /** Days the current period runs from `startsAt` to `endsAt`. */
  periodDays(): number {
    return Math.max(
      1,
      Math.round((this.endsAt.getTime() - this.startsAt.getTime()) / DAY_MS),
    );
  }

  limits(catalogue: PlanCatalogue): Record<PlanGrant, number> {
    return catalogue.limits(this.planCode, this.addOns);
  }

  /** The unused share of what was paid for this period, by days left. */
  unusedValue(now: Date): number {
    if (this.status(now) !== "active") return 0;
    return prorate(
      this.paidValue,
      Math.min(this.daysLeft(now), this.periodDays()),
      this.periodDays(),
    );
  }

  /** The Subscription after a paid order (CM-117). */
  afterPayment(terms: PaidOrderTerms, paidAt: Date): Subscription {
    const months = terms.months ?? 0;
    const ended = this.hasEnded(paidAt);
    switch (terms.kind) {
      case "new":
      case "upgrade":
        return this.with({
          planCode: terms.planCode,
          startsAt: paidAt,
          endsAt: addMonths(paidAt, months),
          addOns: terms.addOns,
          paidValue: terms.subTotal,
        });
      case "extend":
        if (ended)
          return this.with({
            planCode: terms.planCode,
            startsAt: paidAt,
            endsAt: addMonths(paidAt, months),
            paidValue: terms.subTotal,
          });
        return this.with({
          endsAt: addMonths(this.endsAt, months),
          paidValue: this.paidValue + terms.subTotal,
        });
      case "add_ons": {
        const addOns: Partial<Record<PlanGrant, number>> = {};
        for (const grant of PLAN_GRANTS) {
          const total = (this.addOns[grant] ?? 0) + (terms.addOns[grant] ?? 0);
          if (total > 0) addOns[grant] = total;
        }
        return this.with({
          addOns,
          paidValue: this.paidValue + terms.subTotal,
        });
      }
    }
  }

  private with(
    changes: Partial<
      Pick<
        Subscription,
        "planCode" | "startsAt" | "endsAt" | "addOns" | "paidValue"
      >
    >,
  ): Subscription {
    return new Subscription(
      this.id,
      this.workspaceId,
      changes.planCode ?? this.planCode,
      changes.startsAt ?? this.startsAt,
      changes.endsAt ?? this.endsAt,
      this.autoRenew,
      changes.addOns ?? this.addOns,
      changes.paidValue ?? this.paidValue,
    );
  }
}
