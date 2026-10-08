/** What a Company's plan counts (CM-116). */
export type PlanGrant =
  "team_member" | "hrms_member" | "project" | "storage_gb";

/**
 * Plan limits for create commands (CM-118). Throws `PLAN_LIMIT_EXCEEDED`
 * or `PLAN_EXPIRED`; the organization context implements it over the
 * Company's subscription.
 */
export type PlanGate = {
  assertCanAdd(
    workspaceId: string,
    grant: PlanGrant,
    quantity?: number,
  ): Promise<void>;
};

/** Allows everything; for tests that are not about plans. */
export const UNLIMITED_PLAN: PlanGate = {
  assertCanAdd: () => Promise.resolve(),
};
