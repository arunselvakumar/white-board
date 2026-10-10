import {
  addDays,
  assertCalendarDate,
  daysBetween,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";

import { isoWeekday, type IsoWeekday } from "./calendar";
import { isSettingsWorkingDay, type HrmsSettings } from "./hrms-settings";
import type { RotationSlot, RotationType } from "./shift";

/**
 * Shift assignments "until changed" and the effective shift on a date
 * (CM-307, `modules/10` "ShiftAssignment").
 *
 * A member has at most one assignment in force on any date: a shift
 * template or a rotation template from `effectiveFrom` to `effectiveTo`
 * (inclusive; null = until changed). Assigning a new one closes the one in
 * force on the day before the new start; assignments never overlap.
 */

/** One assignment, as the resolver reads it. */
export type AssignmentSpan = Readonly<{
  id: string;
  /** Exactly one of the two is set. */
  shiftTemplateId: string | null;
  rotationTemplateId: string | null;
  effectiveFrom: CalendarDate;
  /** Inclusive; null = until changed. */
  effectiveTo: CalendarDate | null;
}>;

/** A shift template's rules, as the resolver reads them. */
export type ShiftRule = Readonly<{
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  workingDays: readonly IsoWeekday[];
  workingHours: number;
  halfDayHours: number;
  graceMinutes: number;
  overtimeAllowed: boolean;
}>;

/** A rotation template's cycle, as the resolver reads it. */
export type RotationRule = Readonly<{
  id: string;
  name: string;
  type: RotationType;
  /** `daysPerCycle` slots, in order. */
  slots: readonly RotationSlot[];
}>;

/**
 * The shift a member works on a date. Same shape as the application port's
 * `EffectiveShift` (`application/ports.ts`).
 */
export type ResolvedShift = {
  source: "shift" | "rotation" | "settings";
  shiftTemplateId: string | null;
  rotationTemplateId: string | null;
  name: string;
  startTime: string | null;
  endTime: string | null;
  workingHours: number;
  halfDayHours: number;
  graceMinutes: number;
  overtimeAllowed: boolean;
  isWorkingDay: boolean;
};

/** The name of the virtual shift members without an assignment work. */
export const STANDARD_SHIFT_NAME = "Standard";
/** The name of a rotation's Week Off slot. */
export const WEEK_OFF_NAME = "Week Off";

function covers(span: AssignmentSpan, date: CalendarDate): boolean {
  return (
    daysBetween(span.effectiveFrom, date) >= 0 &&
    (span.effectiveTo == null || daysBetween(date, span.effectiveTo) >= 0)
  );
}

/** The assignment in force on `date`, or null. */
export function assignmentOn(
  assignments: readonly AssignmentSpan[],
  date: CalendarDate,
): AssignmentSpan | null {
  // The latest start wins should data ever overlap.
  let found: AssignmentSpan | null = null;
  for (const span of assignments)
    if (
      covers(span, date) &&
      (found == null ||
        daysBetween(found.effectiveFrom, span.effectiveFrom) > 0)
    )
      found = span;
  return found;
}

/**
 * Which slot of a rotation applies on `date` for an assignment starting
 * `effectiveFrom`: a Week rotation by weekday (Monday = slot 0), a Month
 * rotation by day of the month (the 1st = slot 0), a Custom Cycle by the
 * days since the assignment started, modulo the cycle.
 */
export function rotationSlotIndex(
  rotation: Pick<RotationRule, "type" | "slots">,
  effectiveFrom: CalendarDate,
  date: CalendarDate,
): number {
  const length = rotation.slots.length;
  if (length === 0) throw new RangeError("A rotation has no slots.");
  if (rotation.type === "week") return (isoWeekday(date) - 1) % length;
  if (rotation.type === "month")
    return (Number(assertCalendarDate(date).slice(8, 10)) - 1) % length;
  const days = daysBetween(effectiveFrom, date);
  return ((days % length) + length) % length;
}

/** The Settings day: no times, the Company's hours and grace, no overtime pay. */
export function settingsShift(
  settings: HrmsSettings,
  date: CalendarDate,
): ResolvedShift {
  return {
    source: "settings",
    shiftTemplateId: null,
    rotationTemplateId: null,
    name: STANDARD_SHIFT_NAME,
    startTime: null,
    endTime: null,
    workingHours: settings.workingHoursPerDay,
    halfDayHours: settings.halfDayHours,
    graceMinutes: settings.graceMinutes,
    overtimeAllowed: false,
    isWorkingDay: isSettingsWorkingDay(settings, date),
  };
}

function fromShift(
  shift: ShiftRule,
  rotationTemplateId: string | null,
  isWorkingDay: boolean,
): ResolvedShift {
  return {
    source: rotationTemplateId == null ? "shift" : "rotation",
    shiftTemplateId: shift.id,
    rotationTemplateId,
    name: shift.name,
    startTime: shift.startTime,
    endTime: shift.endTime,
    workingHours: shift.workingHours,
    halfDayHours: shift.halfDayHours,
    graceMinutes: shift.graceMinutes,
    overtimeAllowed: shift.overtimeAllowed,
    isWorkingDay,
  };
}

/** What the resolver needs about one member. */
export type ShiftBook = {
  settings: HrmsSettings;
  /** The member's live assignments (any order). */
  assignments: readonly AssignmentSpan[];
  /** Shift templates by id (inactive ones too: history still uses them). */
  shifts: ReadonlyMap<string, ShiftRule>;
  rotations: ReadonlyMap<string, RotationRule>;
};

/**
 * The effective shift on a date (CM-307):
 *
 * - a **shift** assignment in force: that shift; a working day when the
 *   shift works that weekday;
 * - a **rotation** assignment in force: the slot for the date
 *   (`rotationSlotIndex`). A shift slot is a working day whatever the
 *   shift's own working days (the rotation decides); a Week Off slot is
 *   not, and carries the Settings hours;
 * - **no assignment** (or a template that cannot be read): the Settings
 *   day (`settingsShift`).
 *
 * A shift crossing midnight belongs to the date it starts.
 */
export function resolveShift(
  book: ShiftBook,
  date: CalendarDate,
): ResolvedShift {
  const span = assignmentOn(book.assignments, date);
  if (span == null) return settingsShift(book.settings, date);

  if (span.shiftTemplateId != null) {
    const shift = book.shifts.get(span.shiftTemplateId);
    if (shift == null) return settingsShift(book.settings, date);
    return fromShift(shift, null, shift.workingDays.includes(isoWeekday(date)));
  }

  const rotation =
    span.rotationTemplateId == null
      ? undefined
      : book.rotations.get(span.rotationTemplateId);
  if (rotation == null || rotation.slots.length === 0)
    return settingsShift(book.settings, date);
  const slot = rotation.slots[
    rotationSlotIndex(rotation, span.effectiveFrom, date)
  ] ?? { kind: "week_off" };
  if (slot.kind === "shift") {
    const shift = book.shifts.get(slot.shiftTemplateId);
    if (shift != null) return fromShift(shift, rotation.id, true);
  }
  return {
    ...settingsShift(book.settings, date),
    source: "rotation",
    rotationTemplateId: rotation.id,
    name: WEEK_OFF_NAME,
    isWorkingDay: false,
  };
}

// ---------------------------------------------------------------------------
// Assigning
// ---------------------------------------------------------------------------

/** What assigning from `effectiveFrom` does to a member's assignments. */
export type AssignmentPlan = {
  /** Close this assignment on `closeOn` (the day before the new start). */
  close: { id: string; closeOn: CalendarDate } | null;
  /** The assignment starting the same day, replaced by the new one. */
  replace: string | null;
};

/**
 * Plans a new assignment from `effectiveFrom` against the member's live
 * assignments ("until changed"):
 *
 * - none yet: just add it;
 * - the latest starts earlier: close it the day before the new start;
 * - the latest starts the same day: the new one replaces it (a correction);
 * - the latest starts later: refused (400 `SHIFT_ASSIGNMENT_BEFORE_LATEST`),
 *   since history cannot be rewritten underneath a later assignment.
 */
export function planAssignment(
  assignments: readonly AssignmentSpan[],
  effectiveFrom: CalendarDate,
): AssignmentPlan {
  assertCalendarDate(effectiveFrom, "SHIFT_ASSIGNMENT_DATE_INVALID");
  let latest: AssignmentSpan | null = null;
  for (const span of assignments)
    if (
      latest == null ||
      daysBetween(latest.effectiveFrom, span.effectiveFrom) > 0
    )
      latest = span;
  if (latest == null) return { close: null, replace: null };
  const gap = daysBetween(latest.effectiveFrom, effectiveFrom);
  if (gap < 0)
    throw new DomainError(
      "SHIFT_ASSIGNMENT_BEFORE_LATEST",
      `A shift is already assigned from ${latest.effectiveFrom}. Choose that date or a later one.`,
      { details: { field: "effectiveFrom", latestFrom: latest.effectiveFrom } },
    );
  if (gap === 0) {
    // The one before it, if any, already ends the day before this date.
    return { close: null, replace: latest.id };
  }
  const closeOn = addDays(effectiveFrom, -1);
  if (
    latest.effectiveTo != null &&
    daysBetween(latest.effectiveTo, closeOn) >= 0
  )
    return { close: null, replace: null };
  return { close: { id: latest.id, closeOn }, replace: null };
}
