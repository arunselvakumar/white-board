import { PLAN_GRANTS, type PlanGrant } from "@/src/shared-kernel/plan";

/**
 * What a Company uses now, per grant (CM-116): live Projects, live Normal
 * and HRMS Team Members (the Owner counts as a Team Member), and storage in
 * GB. Computed from counts, never stored.
 */
export type UsageSnapshot = Readonly<Record<PlanGrant, number>>;

export const BYTES_PER_GB = 1024 ** 3;

export type UsageBar = { grant: PlanGrant; used: number; limit: number };

/** One bar per grant for "Your Subscription"; storage to one decimal. */
export function usageBars(
  usage: UsageSnapshot,
  limits: Readonly<Record<PlanGrant, number>>,
): UsageBar[] {
  return PLAN_GRANTS.map((grant) => ({
    grant,
    used:
      grant === "storage_gb" ? Math.ceil(usage[grant] * 10) / 10 : usage[grant],
    limit: limits[grant],
  }));
}
