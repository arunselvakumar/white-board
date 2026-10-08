/**
 * The plan port lives in the shared kernel so every context's create
 * commands can ask it (CM-118); the organization context implements it as
 * `SubscriptionPlanGate`.
 */
export {
  UNLIMITED_PLAN,
  type PlanGate,
  type PlanGrant,
} from "@/src/shared-kernel/plan";
