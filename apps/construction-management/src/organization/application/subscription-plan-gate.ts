import {
  planExpired,
  planLimitExceeded,
  type PlanGate,
  type PlanGrant,
} from "@/src/shared-kernel/plan";

import type { PlanCatalogue } from "../domain/plan";
import type { SubscriptionRepository, UsageReader } from "./subscription-ports";

/**
 * The plan limits over the Company's Subscription and usage (CM-118):
 * `PLAN_EXPIRED` once the plan has ended, `PLAN_LIMIT_EXCEEDED` with
 * `{ grant, limit, used }` when the plan plus add-ons allows no more.
 * A Company with no Subscription row (seeded test data only; every created
 * Company has one) is not limited.
 */
export class SubscriptionPlanGate implements PlanGate {
  constructor(
    private readonly subscriptions: Pick<SubscriptionRepository, "find">,
    private readonly usage: UsageReader,
    private readonly catalogue: PlanCatalogue,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async assertCanAdd(
    workspaceId: string,
    grant: PlanGrant,
    quantity = 1,
  ): Promise<void> {
    const subscription = await this.subscriptions.find(workspaceId);
    if (subscription == null) return;
    if (subscription.hasEnded(this.clock())) throw planExpired();
    const limit = subscription.limits(this.catalogue)[grant];
    const used = await this.usage.count(workspaceId, grant);
    if (used + quantity > limit) throw planLimitExceeded(grant, limit, used);
  }
}
