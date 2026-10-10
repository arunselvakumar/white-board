import { DomainError } from "@/src/shared-kernel/domain-error";

import { hasTwoDecimals } from "./leave-days";

/**
 * A kind of leave (CM-310, `modules/10` "LeaveType", ADR CM-0012 §7). Each
 * Company starts with the six seeds of `modules/10` and may add its own.
 * Every rule is checked here; the database repeats them as a CHECK
 * constraint (`leave_types_rules_check`).
 */

/**
 * How a leave type is credited (ADR CM-0012 §7): `none` (Comp Off is
 * credited by a manager's adjustment, Loss of Pay is unlimited and
 * unpaid), `upfront` (the whole entitlement when the balance is
 * initialised) or `periodic` (a credit each month on the accrual day).
 */
export const ACCRUAL_MODES = ["none", "upfront", "periodic"] as const;

export type AccrualMode = (typeof ACCRUAL_MODES)[number];

/** Only monthly is offered (`modules/10`: only `monthly` was observed). */
export const ACCRUAL_FREQUENCIES = ["monthly"] as const;

export type AccrualFrequency = (typeof ACCRUAL_FREQUENCIES)[number];

export const ACCRUAL_MODE_LABELS: Record<
  AccrualMode,
  { label: string; hint: string }
> = {
  none: {
    label: "No credit",
    hint: "Days come only from a manager's adjustment, like Compensatory Off. Unpaid leave needs no balance.",
  },
  upfront: {
    label: "Upfront",
    hint: "The whole entitlement is credited when the balance is initialised.",
  },
  periodic: {
    label: "Monthly",
    hint: "A credit each month on the accrual day, up to the yearly limit.",
  },
};

export const LEAVE_TYPE_LIMITS = {
  maxNameLength: 60,
  /** No leave type gives more than a year of days. */
  maxDays: 366,
  maxApprovalLevels: 2,
  /** The 29th–31st do not exist in every month. */
  maxAccrualDay: 28,
} as const;

export type LeaveType = Readonly<{
  name: string;
  /** Days a year; 0 for Comp Off and Loss of Pay. */
  yearlyLimit: number;
  isPaid: boolean;
  requiresApproval: boolean;
  /** Overrides the Settings levels; null when it uses them or needs no approval. */
  approvalLevels: 1 | 2 | null;
  /** The most leave days one request may hold; null = no cap. */
  maxConsecutiveDays: number | null;
  carryForward: boolean;
  /** Set exactly when `carryForward`. */
  maxCarryForward: number | null;
  accrualMode: AccrualMode;
  /** Periodic only. */
  accrualFrequency: AccrualFrequency | null;
  /** Day of the month the credit is posted, 1–28; periodic only. */
  accrualDay: number | null;
  /** Days per period, e.g. 1.25; periodic only. */
  creditPerPeriod: number | null;
  /** May be taken before it is credited, up to the yearly limit. */
  allowAdvanceUse: boolean;
  isActive: boolean;
}>;

/** What a save sends; values that only apply when a switch is on are ignored otherwise. */
export type LeaveTypeInput = {
  name: string;
  yearlyLimit: number;
  isPaid: boolean;
  requiresApproval: boolean;
  approvalLevels?: number | null;
  maxConsecutiveDays?: number | null;
  carryForward: boolean;
  maxCarryForward?: number | null;
  accrualMode: string;
  accrualFrequency?: string | null;
  accrualDay?: number | null;
  creditPerPeriod?: number | null;
  allowAdvanceUse: boolean;
  isActive?: boolean;
};

function invalid(code: string, message: string, field: string): DomainError {
  return new DomainError(code, message, { details: { field } });
}

function isAccrualMode(value: string): value is AccrualMode {
  return (ACCRUAL_MODES as readonly string[]).includes(value);
}

function days(value: number): number {
  return Math.round(value * 100) / 100;
}

function isDayCount(value: number, allowZero: boolean): boolean {
  return (
    hasTwoDecimals(value) &&
    (allowZero ? value >= 0 : value > 0) &&
    value <= LEAVE_TYPE_LIMITS.maxDays
  );
}

/**
 * Validates and normalises a leave type: the name trimmed; approval levels
 * dropped when no approval is needed; the carry-forward cap dropped when
 * not carrying forward; accrual settings dropped unless periodic. Throws a
 * `DomainError` whose `details.field` names the field at fault.
 */
export function createLeaveType(input: LeaveTypeInput): LeaveType {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name === "")
    throw invalid(
      "LEAVE_TYPE_NAME_REQUIRED",
      "Enter the leave type's name.",
      "name",
    );
  if (name.length > LEAVE_TYPE_LIMITS.maxNameLength)
    throw invalid(
      "LEAVE_TYPE_NAME_TOO_LONG",
      `Use at most ${String(LEAVE_TYPE_LIMITS.maxNameLength)} characters.`,
      "name",
    );

  if (!isDayCount(input.yearlyLimit, true))
    throw invalid(
      "YEARLY_LIMIT_INVALID",
      `The yearly limit is 0 to ${String(LEAVE_TYPE_LIMITS.maxDays)} days, up to two decimals.`,
      "yearlyLimit",
    );

  let approvalLevels: 1 | 2 | null = null;
  if (input.requiresApproval && input.approvalLevels != null) {
    if (input.approvalLevels !== 1 && input.approvalLevels !== 2)
      throw invalid(
        "APPROVAL_LEVELS_INVALID",
        "Approval levels are 1 or 2, or the Settings' levels.",
        "approvalLevels",
      );
    approvalLevels = input.approvalLevels;
  }

  const maxConsecutiveDays = input.maxConsecutiveDays ?? null;
  if (
    maxConsecutiveDays != null &&
    (!Number.isInteger(maxConsecutiveDays) ||
      maxConsecutiveDays < 1 ||
      maxConsecutiveDays > LEAVE_TYPE_LIMITS.maxDays)
  )
    throw invalid(
      "MAX_CONSECUTIVE_DAYS_INVALID",
      `The most days in one request is a whole number from 1 to ${String(LEAVE_TYPE_LIMITS.maxDays)}.`,
      "maxConsecutiveDays",
    );

  let maxCarryForward: number | null = null;
  if (input.carryForward) {
    if (input.maxCarryForward == null)
      throw invalid(
        "CARRY_FORWARD_MAX_REQUIRED",
        "Enter the most days that can be carried forward.",
        "maxCarryForward",
      );
    if (!isDayCount(input.maxCarryForward, true))
      throw invalid(
        "CARRY_FORWARD_MAX_INVALID",
        `The carry-forward cap is 0 to ${String(LEAVE_TYPE_LIMITS.maxDays)} days, up to two decimals.`,
        "maxCarryForward",
      );
    maxCarryForward = days(input.maxCarryForward);
  }

  if (!isAccrualMode(input.accrualMode))
    throw invalid(
      "ACCRUAL_MODE_INVALID",
      "Choose No credit, Upfront or Monthly.",
      "accrualMode",
    );

  let accrualFrequency: AccrualFrequency | null = null;
  let accrualDay: number | null = null;
  let creditPerPeriod: number | null = null;
  if (input.accrualMode === "periodic") {
    if (input.yearlyLimit <= 0)
      throw invalid(
        "YEARLY_LIMIT_REQUIRED_FOR_ACCRUAL",
        "A leave type credited every month needs a yearly limit above 0.",
        "yearlyLimit",
      );
    if (input.accrualFrequency != null && input.accrualFrequency !== "monthly")
      throw invalid(
        "ACCRUAL_FREQUENCY_INVALID",
        "Leave is credited monthly.",
        "accrualFrequency",
      );
    accrualFrequency = "monthly";
    if (input.accrualDay == null)
      throw invalid(
        "ACCRUAL_DAY_REQUIRED",
        "Choose the day of the month the credit is posted.",
        "accrualDay",
      );
    if (
      !Number.isInteger(input.accrualDay) ||
      input.accrualDay < 1 ||
      input.accrualDay > LEAVE_TYPE_LIMITS.maxAccrualDay
    )
      throw invalid(
        "ACCRUAL_DAY_INVALID",
        `The accrual day is 1 to ${String(LEAVE_TYPE_LIMITS.maxAccrualDay)}.`,
        "accrualDay",
      );
    accrualDay = input.accrualDay;
    if (input.creditPerPeriod == null)
      throw invalid(
        "CREDIT_PER_PERIOD_REQUIRED",
        "Enter the days credited each month.",
        "creditPerPeriod",
      );
    if (
      !isDayCount(input.creditPerPeriod, false) ||
      input.creditPerPeriod > input.yearlyLimit
    )
      throw invalid(
        "CREDIT_PER_PERIOD_INVALID",
        "The monthly credit is above 0 and at most the yearly limit, up to two decimals.",
        "creditPerPeriod",
      );
    creditPerPeriod = days(input.creditPerPeriod);
  }

  return Object.freeze({
    name,
    yearlyLimit: days(input.yearlyLimit),
    isPaid: input.isPaid,
    requiresApproval: input.requiresApproval,
    approvalLevels,
    maxConsecutiveDays,
    carryForward: input.carryForward,
    maxCarryForward,
    accrualMode: input.accrualMode,
    accrualFrequency,
    accrualDay,
    creditPerPeriod,
    allowAdvanceUse: input.allowAdvanceUse,
    isActive: input.isActive ?? true,
  });
}

/**
 * How many approvals a request of this type needs: 0 when the type needs
 * none (approved at once), else the type's own levels or the Settings'.
 */
export function approvalLevelsFor(
  type: Pick<LeaveType, "requiresApproval" | "approvalLevels">,
  settingsLevels: 1 | 2,
): 0 | 1 | 2 {
  if (!type.requiresApproval) return 0;
  return type.approvalLevels ?? settingsLevels;
}
