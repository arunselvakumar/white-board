import { DomainError } from "@/src/shared-kernel/domain-error";

import { hasTwoDecimals } from "./leave-days";
import { LEAVE_TYPE_LIMITS } from "./leave-type";

/**
 * A named bundle of leave types with entitlements (CM-311, `modules/10`
 * "LeaveStructure"). A line without an entitlement uses the type's yearly
 * limit. Members are assigned a structure from a date; the latest
 * assignment on or before a day is the one in force.
 */

export const LEAVE_STRUCTURE_LIMITS = {
  maxNameLength: 80,
  maxDescriptionLength: 500,
  maxLines: 50,
} as const;

export type LeaveStructureLine = Readonly<{
  leaveTypeId: string;
  /** Overrides the type's yearly limit; null = the yearly limit. */
  entitlementDays: number | null;
}>;

export type LeaveStructure = Readonly<{
  name: string;
  description: string | null;
  lines: readonly LeaveStructureLine[];
}>;

export type LeaveStructureInput = {
  name: string;
  description?: string | null;
  lines: readonly { leaveTypeId: string; entitlementDays?: number | null }[];
};

function invalid(
  code: string,
  message: string,
  field: string,
  extra: Record<string, unknown> = {},
): DomainError {
  return new DomainError(code, message, { details: { field, ...extra } });
}

/** Validates a structure: a name, at least one leave type, each type once. */
export function createLeaveStructure(
  input: LeaveStructureInput,
): LeaveStructure {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name === "")
    throw invalid(
      "LEAVE_STRUCTURE_NAME_REQUIRED",
      "Enter the structure's name.",
      "name",
    );
  if (name.length > LEAVE_STRUCTURE_LIMITS.maxNameLength)
    throw invalid(
      "LEAVE_STRUCTURE_NAME_TOO_LONG",
      `Use at most ${String(LEAVE_STRUCTURE_LIMITS.maxNameLength)} characters.`,
      "name",
    );
  const description = input.description?.trim() ?? "";
  if (description.length > LEAVE_STRUCTURE_LIMITS.maxDescriptionLength)
    throw invalid(
      "LEAVE_STRUCTURE_DESCRIPTION_TOO_LONG",
      `Use at most ${String(LEAVE_STRUCTURE_LIMITS.maxDescriptionLength)} characters.`,
      "description",
    );
  if (input.lines.length === 0)
    throw invalid(
      "LEAVE_STRUCTURE_LINES_REQUIRED",
      "Add at least one leave type.",
      "lines",
    );
  if (input.lines.length > LEAVE_STRUCTURE_LIMITS.maxLines)
    throw invalid(
      "LEAVE_STRUCTURE_TOO_MANY_LINES",
      `A structure holds at most ${String(LEAVE_STRUCTURE_LIMITS.maxLines)} leave types.`,
      "lines",
    );
  const seen = new Set<string>();
  const lines = input.lines.map((line, index) => {
    if (seen.has(line.leaveTypeId))
      throw invalid(
        "LEAVE_STRUCTURE_LINE_DUPLICATE",
        "Each leave type can be in a structure once.",
        "lines",
        { index },
      );
    seen.add(line.leaveTypeId);
    const entitlement = line.entitlementDays ?? null;
    if (
      entitlement != null &&
      (!hasTwoDecimals(entitlement) ||
        entitlement < 0 ||
        entitlement > LEAVE_TYPE_LIMITS.maxDays)
    )
      throw invalid(
        "LEAVE_ENTITLEMENT_INVALID",
        `An entitlement is 0 to ${String(LEAVE_TYPE_LIMITS.maxDays)} days, up to two decimals.`,
        "lines",
        { index },
      );
    return Object.freeze({
      leaveTypeId: line.leaveTypeId,
      entitlementDays:
        entitlement == null ? null : Math.round(entitlement * 100) / 100,
    });
  });
  return Object.freeze({
    name,
    description: description === "" ? null : description,
    lines: Object.freeze(lines),
  });
}

/** A line's entitlement: its own days, else the type's yearly limit. */
export function entitlementOf(
  line: Pick<LeaveStructureLine, "entitlementDays"> | null | undefined,
  type: { yearlyLimit: number },
): number {
  return line?.entitlementDays ?? type.yearlyLimit;
}

/** The assignment in force on `date`: the latest `effectiveFrom` on or before it. */
export function assignmentInForce<T extends { effectiveFrom: string }>(
  assignments: readonly T[],
  date: string,
): T | null {
  let found: T | null = null;
  for (const assignment of assignments) {
    if (assignment.effectiveFrom > date) continue;
    if (found == null || assignment.effectiveFrom > found.effectiveFrom)
      found = assignment;
  }
  return found;
}
