import type { Flag } from "./access/flags";
import { DomainError } from "./domain-error";

/**
 * Flags that change data. On an ended plan they are refused with
 * `PLAN_EXPIRED`; reading, printing, reports and `export` stay open
 * (`modules/01` rebuild recommendation 9: no data hostage).
 */
export const WRITE_FLAGS: readonly Flag[] = [
  "create",
  "update",
  "delete",
  "approve",
  "reject",
  "transfer",
  "import",
];

export function isWriteFlag(flag: Flag): boolean {
  return WRITE_FLAGS.includes(flag);
}

/**
 * What a Company's Plan counts (CM-116, `modules/01` Plan includes). Every
 * context that creates one of these asks the `PlanGate` first (CM-118).
 */
export const PLAN_GRANTS = [
  "project",
  "team_member",
  "hrms_member",
  "storage_gb",
] as const;

export type PlanGrant = (typeof PLAN_GRANTS)[number];

export function isPlanGrant(value: string): value is PlanGrant {
  return (PLAN_GRANTS as readonly string[]).includes(value);
}

/** Plan limits for create commands (CM-118); the organization context implements it. */
export type PlanGate = {
  /**
   * Throws `PLAN_EXPIRED` when the Company's plan has ended, and
   * `PLAN_LIMIT_EXCEEDED` when `quantity` more would pass the limit.
   */
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

const GRANT_WORDS: Record<PlanGrant, string> = {
  project: "Projects",
  team_member: "Team Members",
  hrms_member: "HRMS Team Members",
  storage_gb: "GB of storage",
};

/** 402: the plan plus its add-ons allows no more of this grant. */
export function planLimitExceeded(
  grant: PlanGrant,
  limit: number,
  used: number,
): DomainError {
  return new DomainError(
    "PLAN_LIMIT_EXCEEDED",
    `Your plan allows ${String(limit)} ${GRANT_WORDS[grant]}. Buy an add-on to add more.`,
    { kind: "limit", details: { grant, limit, used } },
  );
}

/** 402: the plan has ended; the Company is read-only until it is renewed. */
export function planExpired(): DomainError {
  return new DomainError(
    "PLAN_EXPIRED",
    "Your plan has ended. Your data is safe and read-only; export is still available. The Owner can choose a plan to continue.",
    { kind: "limit" },
  );
}
