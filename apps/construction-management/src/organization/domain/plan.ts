import { DomainError, notFound } from "@/src/shared-kernel/domain-error";
import {
  PLAN_GRANTS,
  isPlanGrant,
  type PlanGrant,
} from "@/src/shared-kernel/plan";

/** A price for one length of a Plan, before GST, in paise. */
export type PlanDuration = { months: number; pricePaise: number };

export type PlanIncludes = Readonly<Record<PlanGrant, number>>;

/**
 * What a Company can buy (CM-116). Prices are data
 * (`infrastructure/seeds/plans.json`); `rank` orders Plans for "the new
 * Plan must be the same or higher".
 */
export type Plan = {
  code: string;
  name: string;
  rank: number;
  durations: readonly PlanDuration[];
  includes: PlanIncludes;
};

/**
 * More of one grant, per unit per month (`modules/01` AddOn). Storage is
 * sold in units of `unitSize` GB.
 */
export type AddOn = {
  grant: PlanGrant;
  name: string;
  unitSize: number;
  pricePerUnitPerMonthPaise: number;
  minimumQuantity: number;
};

/** Units of each add-on: storage counts 30 GB units, not GB. */
export type AddOnQuantities = Readonly<Partial<Record<PlanGrant, number>>>;

/** Upper bound on one add-on line, so amounts stay well inside an Int. */
export const MAX_ADD_ON_QUANTITY = 500;

export class PlanCatalogue {
  private constructor(
    readonly version: number,
    readonly currency: string,
    readonly plans: readonly Plan[],
    readonly addOns: readonly AddOn[],
  ) {}

  static of(input: {
    version: number;
    currency?: string;
    plans: readonly Plan[];
    addOns: readonly AddOn[];
  }): PlanCatalogue {
    const fail = (why: string) => {
      throw new Error(`Invalid plan catalogue: ${why}`);
    };
    if (input.plans.length === 0) fail("no plans");
    const codes = new Set<string>();
    for (const plan of input.plans) {
      if (codes.has(plan.code)) fail(`duplicate plan ${plan.code}`);
      codes.add(plan.code);
      if (plan.durations.length === 0) fail(`${plan.code} has no durations`);
      for (const duration of plan.durations)
        if (
          !Number.isInteger(duration.months) ||
          duration.months < 1 ||
          !Number.isSafeInteger(duration.pricePaise) ||
          duration.pricePaise <= 0
        )
          fail(`${plan.code} has a bad duration`);
      for (const grant of PLAN_GRANTS)
        if (!Number.isInteger(plan.includes[grant]) || plan.includes[grant] < 0)
          fail(`${plan.code} must include a count for ${grant}`);
    }
    const grants = new Set<PlanGrant>();
    for (const addOn of input.addOns) {
      const grant: string = addOn.grant;
      if (!isPlanGrant(grant)) fail(`unknown add-on ${grant}`);
      if (grants.has(addOn.grant)) fail(`duplicate add-on ${addOn.grant}`);
      grants.add(addOn.grant);
      if (
        addOn.unitSize < 1 ||
        addOn.pricePerUnitPerMonthPaise <= 0 ||
        addOn.minimumQuantity < 1
      )
        fail(`add-on ${addOn.grant} has a bad price, size or minimum`);
    }
    return new PlanCatalogue(
      input.version,
      input.currency ?? "INR",
      [...input.plans].sort((a, b) => a.rank - b.rank),
      input.addOns,
    );
  }

  findPlan(code: string): Plan | null {
    return this.plans.find((plan) => plan.code === code) ?? null;
  }

  plan(code: string): Plan {
    const plan = this.findPlan(code);
    if (plan == null)
      throw notFound("PLAN_NOT_FOUND", "Choose a plan from the list.");
    return plan;
  }

  duration(plan: Plan, months: number): PlanDuration {
    const duration = plan.durations.find((item) => item.months === months);
    if (duration == null)
      throw new DomainError(
        "DURATION_NOT_OFFERED",
        `${plan.name} is not sold for ${String(months)} months.`,
      );
    return duration;
  }

  addOn(grant: PlanGrant): AddOn | null {
    return this.addOns.find((item) => item.grant === grant) ?? null;
  }

  /** Checks add-on quantities: whole, at least the minimum, at most the cap. */
  addOnQuantities(raw: AddOnQuantities): AddOnQuantities {
    const result: Partial<Record<PlanGrant, number>> = {};
    for (const grant of PLAN_GRANTS) {
      const quantity = raw[grant] ?? 0;
      if (quantity === 0) continue;
      const addOn = this.addOn(grant);
      if (addOn == null)
        throw new DomainError("ADD_ON_NOT_OFFERED", "This add-on is not sold.");
      if (
        !Number.isInteger(quantity) ||
        quantity < addOn.minimumQuantity ||
        quantity > MAX_ADD_ON_QUANTITY
      )
        throw new DomainError(
          "ADD_ON_QUANTITY_INVALID",
          `${addOn.name}: buy at least ${String(addOn.minimumQuantity)} and at most ${String(MAX_ADD_ON_QUANTITY)}.`,
          { details: { grant, minimum: addOn.minimumQuantity } },
        );
      result[grant] = quantity;
    }
    return result;
  }

  /** Plan includes plus add-on units × unit size, per grant. */
  limits(planCode: string, addOns: AddOnQuantities): Record<PlanGrant, number> {
    const plan = this.plan(planCode);
    const limits = { ...plan.includes };
    for (const grant of PLAN_GRANTS) {
      const units = addOns[grant] ?? 0;
      limits[grant] += units * (this.addOn(grant)?.unitSize ?? 0);
    }
    return limits;
  }
}
