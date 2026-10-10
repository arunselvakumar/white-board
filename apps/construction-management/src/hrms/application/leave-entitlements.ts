import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";

import type { HrmsSettings } from "../domain/hrms-settings";
import { leaveYearFromKey } from "../domain/leave-balance";
import { assignmentInForce, entitlementOf } from "../domain/leave-structure";
import { leaveYearOf, type LeaveYear } from "../domain/leave-year";
import type {
  LeaveStructureStore,
  LeaveTypeStore,
  StoredLeaveType,
} from "./leave-ports";

/** What a member is entitled to in one leave year. */
export type MemberEntitlements = {
  memberId: string;
  /** The structure in force, or null (every active type at its yearly limit). */
  structureId: string | null;
  /** Leave type id → entitlement days. */
  lines: Map<string, number>;
  /** The day the year's balance starts: the year's first day, or a later assignment. */
  start: CalendarDate;
};

/**
 * The leave year of a request or a balance: the one named by `key` (400
 * `LEAVE_YEAR_INVALID` when it does not fit the Settings), else the one
 * holding `today`.
 */
export function resolveLeaveYear(
  settings: HrmsSettings,
  today: CalendarDate,
  key?: string | null,
): LeaveYear {
  if (key == null || key === "") return leaveYearOf(today, settings.leaveYear);
  const year = leaveYearFromKey(key, settings.leaveYear);
  if (year == null)
    throw new DomainError(
      "LEAVE_YEAR_INVALID",
      settings.leaveYear === "calendar"
        ? "The leave year is a calendar year, like 2026."
        : "The leave year is a financial year, like 26-27.",
      { details: { field: "leaveYear" } },
    );
  return year;
}

/**
 * Entitlements from leave structures (CM-311): the member's structure in
 * force on `today` held inside the leave year (the year's first day before
 * it starts, its last after it ends), else the first assignment that
 * starts within the year. A member with no structure gets every active
 * leave type at its yearly limit.
 */
export class LeaveEntitlements {
  constructor(
    private readonly types: LeaveTypeStore,
    private readonly structures: LeaveStructureStore,
  ) {}

  async forMembers(
    workspaceId: string,
    memberIds: readonly string[],
    year: LeaveYear,
    today: CalendarDate,
    loadedTypes?: readonly StoredLeaveType[],
  ): Promise<Map<string, MemberEntitlements>> {
    const types = loadedTypes ?? (await this.types.list(workspaceId));
    const byId = new Map(types.map((type) => [type.id, type]));
    const [assignments, structures] = await Promise.all([
      this.structures.assignments(workspaceId, { memberIds }),
      this.structures.list(workspaceId),
    ]);
    const structureById = new Map(structures.map((item) => [item.id, item]));
    const on =
      today < year.start ? year.start : today > year.end ? year.end : today;
    const result = new Map<string, MemberEntitlements>();
    for (const memberId of memberIds) {
      const own = assignments.filter(
        (item) =>
          item.memberId === memberId && structureById.has(item.structureId),
      );
      const assignment =
        assignmentInForce(own, on) ??
        own
          .filter(
            (item) =>
              item.effectiveFrom >= year.start &&
              item.effectiveFrom <= year.end,
          )
          .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))[0] ??
        null;
      const structure =
        assignment == null ? null : structureById.get(assignment.structureId);
      const lines = new Map<string, number>();
      if (structure == null) {
        for (const type of types)
          if (type.isActive) lines.set(type.id, type.yearlyLimit);
      } else {
        for (const line of structure.lines) {
          const type = byId.get(line.leaveTypeId);
          if (type != null) lines.set(type.id, entitlementOf(line, type));
        }
      }
      result.set(memberId, {
        memberId,
        structureId: structure?.id ?? null,
        lines,
        start:
          assignment != null && assignment.effectiveFrom > year.start
            ? assignment.effectiveFrom
            : year.start,
      });
    }
    return result;
  }
}
