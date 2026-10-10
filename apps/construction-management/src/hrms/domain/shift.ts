import { addDays, type CalendarDate } from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";

import { isIsoWeekday, type IsoWeekday } from "./calendar";

/**
 * Shift templates and rotation templates (CM-306, `modules/10` "Shift
 * Template", "Rotation Template").
 *
 * A **shift** has a start and an end in the Company time zone; an end at or
 * before the start crosses midnight (22:00–06:00), and the shift belongs to
 * the day it starts. Its working hours fit inside it, its half-day hours
 * are below its working hours, and its grace period replaces the Settings
 * grace for members on it.
 *
 * A **rotation** is an ordered cycle of slots, each a shift or a Week Off:
 * a Week rotation has 7 slots (Monday … Sunday), a Month rotation 31 (day
 * 1 … 31 of the month), a Custom Cycle 2–12 slots that repeat from the day
 * the rotation is assigned (`effective-shift.ts`).
 */

export const SHIFT_LIMITS = {
  maxNameLength: 60,
  maxWorkingHours: 24,
  maxGraceMinutes: 120,
} as const;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isShiftTime(value: string): boolean {
  return TIME_RE.test(value);
}

/** Minutes after midnight of an `HH:MM` time. */
export function minutesOf(time: string): number {
  const match = TIME_RE.exec(time);
  if (match == null) throw new RangeError(`Not a time: ${time}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

/** The shift ends on the next day (its end is at or before its start). */
export function crossesMidnight(startTime: string, endTime: string): boolean {
  return minutesOf(endTime) <= minutesOf(startTime);
}

/** How long a shift lasts, minutes; a start equal to the end is 24 hours. */
export function shiftLengthMinutes(startTime: string, endTime: string): number {
  const start = minutesOf(startTime);
  const end = minutesOf(endTime);
  return end > start ? end - start : end + 24 * 60 - start;
}

/**
 * When a shift worked on `date` starts and ends, as calendar dates and
 * `HH:MM` times in the Company time zone. A shift crossing midnight ends
 * on the next date (CM-308 reads late arrival and overtime from this).
 */
export function shiftWindow(
  date: CalendarDate,
  startTime: string,
  endTime: string,
): {
  start: { date: CalendarDate; time: string };
  end: { date: CalendarDate; time: string };
} {
  return {
    start: { date, time: startTime },
    end: {
      date: crossesMidnight(startTime, endTime) ? addDays(date, 1) : date,
      time: endTime,
    },
  };
}

export type ShiftTemplateDetails = Readonly<{
  name: string;
  /** `HH:MM`. */
  startTime: string;
  endTime: string;
  /** ISO weekdays, ascending. */
  workingDays: readonly IsoWeekday[];
  workingHours: number;
  halfDayHours: number;
  graceMinutes: number;
  overtimeAllowed: boolean;
  isActive: boolean;
}>;

export type ShiftTemplateInput = {
  name: string;
  startTime: string;
  endTime: string;
  workingDays: readonly number[];
  workingHours: number;
  halfDayHours: number;
  graceMinutes: number;
  overtimeAllowed: boolean;
  isActive: boolean;
};

function invalid(code: string, message: string, field: string): DomainError {
  return new DomainError(code, message, { details: { field } });
}

function hasTwoDecimals(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-9;
}

function hours(value: number): number {
  return Math.round(value * 100) / 100;
}

function templateName(raw: string, code: string): string {
  const name = raw.trim();
  if (name === "")
    throw invalid(`${code}_NAME_REQUIRED`, "Enter a name.", "name");
  if (name.length > SHIFT_LIMITS.maxNameLength)
    throw invalid(
      `${code}_NAME_TOO_LONG`,
      `Use at most ${String(SHIFT_LIMITS.maxNameLength)} characters.`,
      "name",
    );
  return name;
}

/**
 * Validates and normalises a shift template. Throws a `DomainError` whose
 * `details.field` names the field at fault.
 */
export function createShiftTemplate(
  input: ShiftTemplateInput,
): ShiftTemplateDetails {
  const name = templateName(input.name, "SHIFT");
  if (!isShiftTime(input.startTime))
    throw invalid(
      "SHIFT_START_INVALID",
      "Enter the start time as HH:MM, 24-hour.",
      "startTime",
    );
  if (!isShiftTime(input.endTime))
    throw invalid(
      "SHIFT_END_INVALID",
      "Enter the end time as HH:MM, 24-hour.",
      "endTime",
    );
  const workingDays = [...new Set(input.workingDays)].sort((a, b) => a - b);
  if (
    workingDays.length === 0 ||
    workingDays.length !== input.workingDays.length ||
    !workingDays.every(isIsoWeekday)
  )
    throw invalid(
      "SHIFT_WORKING_DAYS_INVALID",
      "Choose at least one working day, each once.",
      "workingDays",
    );
  if (
    !Number.isFinite(input.workingHours) ||
    input.workingHours <= 0 ||
    input.workingHours > SHIFT_LIMITS.maxWorkingHours ||
    !hasTwoDecimals(input.workingHours)
  )
    throw invalid(
      "SHIFT_WORKING_HOURS_INVALID",
      "Working hours are more than 0 and at most 24, with up to two decimals.",
      "workingHours",
    );
  const length = shiftLengthMinutes(input.startTime, input.endTime);
  if (Math.round(input.workingHours * 60) > length)
    throw invalid(
      "SHIFT_WORKING_HOURS_TOO_LONG",
      `Working hours cannot be longer than the shift (${formatMinutes(length)}).`,
      "workingHours",
    );
  if (
    !Number.isFinite(input.halfDayHours) ||
    input.halfDayHours <= 0 ||
    !hasTwoDecimals(input.halfDayHours)
  )
    throw invalid(
      "SHIFT_HALF_DAY_HOURS_INVALID",
      "Half-day hours are more than 0, with up to two decimals.",
      "halfDayHours",
    );
  if (input.halfDayHours >= input.workingHours)
    throw invalid(
      "SHIFT_HALF_DAY_HOURS_INVALID",
      "Half-day hours must be less than the working hours.",
      "halfDayHours",
    );
  if (
    !Number.isInteger(input.graceMinutes) ||
    input.graceMinutes < 0 ||
    input.graceMinutes > SHIFT_LIMITS.maxGraceMinutes
  )
    throw invalid(
      "SHIFT_GRACE_MINUTES_INVALID",
      `The grace period is 0 to ${String(SHIFT_LIMITS.maxGraceMinutes)} whole minutes.`,
      "graceMinutes",
    );
  return Object.freeze({
    name,
    startTime: input.startTime,
    endTime: input.endTime,
    workingDays: Object.freeze(workingDays as IsoWeekday[]),
    workingHours: hours(input.workingHours),
    halfDayHours: hours(input.halfDayHours),
    graceMinutes: input.graceMinutes,
    overtimeAllowed: input.overtimeAllowed,
    isActive: input.isActive,
  });
}

/** `9h`, `8h 30m`. */
export function formatMinutes(minutes: number): string {
  const whole = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0
    ? `${String(whole)}h`
    : `${String(whole)}h ${String(rest)}m`;
}

// ---------------------------------------------------------------------------
// Rotations
// ---------------------------------------------------------------------------

export const ROTATION_TYPES = ["week", "month", "custom_cycle"] as const;

export type RotationType = (typeof ROTATION_TYPES)[number];

export const ROTATION_TYPE_LABELS: Record<RotationType, string> = {
  week: "Week",
  month: "Month",
  custom_cycle: "Custom Cycle",
};

export const CUSTOM_CYCLE_LIMITS = { minDays: 2, maxDays: 12 } as const;

/** Slots in one cycle of a Week (7) or Month (31) rotation. */
export const FIXED_CYCLE_DAYS: Record<"week" | "month", number> = {
  week: 7,
  month: 31,
};

/** One slot: a shift (by template id), or a Week Off. */
export type RotationSlot =
  | Readonly<{ kind: "shift"; shiftTemplateId: string }>
  | Readonly<{ kind: "week_off" }>;

export type RotationTemplateDetails = Readonly<{
  name: string;
  type: RotationType;
  /** 7 for Week, 31 for Month, 2–12 for a Custom Cycle. */
  daysPerCycle: number;
  /** Exactly `daysPerCycle` slots, in order. */
  slots: readonly RotationSlot[];
  isActive: boolean;
}>;

export type RotationTemplateInput = {
  name: string;
  type: string;
  /** Read only for a Custom Cycle. */
  daysPerCycle?: number | null;
  /** A shift template id, or null for a Week Off. */
  slots: readonly (string | null)[];
  isActive: boolean;
};

function isRotationType(value: string): value is RotationType {
  return (ROTATION_TYPES as readonly string[]).includes(value);
}

/** How many slots a rotation of this type has. */
export function cycleLength(
  type: RotationType,
  daysPerCycle?: number | null,
): number {
  return type === "custom_cycle" ? (daysPerCycle ?? 0) : FIXED_CYCLE_DAYS[type];
}

/**
 * Validates a rotation template: the cycle length for its type, one slot
 * per day of the cycle, at least one slot a shift. Whether each shift
 * exists and is active is the handler's check (`assertSlotShiftsUsable`).
 */
export function createRotationTemplate(
  input: RotationTemplateInput,
): RotationTemplateDetails {
  const name = templateName(input.name, "ROTATION");
  if (!isRotationType(input.type))
    throw invalid(
      "ROTATION_TYPE_INVALID",
      "Choose Week, Month or Custom Cycle.",
      "type",
    );
  if (input.type === "custom_cycle") {
    const days = input.daysPerCycle;
    if (
      days == null ||
      !Number.isInteger(days) ||
      days < CUSTOM_CYCLE_LIMITS.minDays ||
      days > CUSTOM_CYCLE_LIMITS.maxDays
    )
      throw invalid(
        "ROTATION_CYCLE_INVALID",
        `A custom cycle is ${String(CUSTOM_CYCLE_LIMITS.minDays)} to ${String(CUSTOM_CYCLE_LIMITS.maxDays)} days.`,
        "daysPerCycle",
      );
  }
  const length = cycleLength(input.type, input.daysPerCycle);
  if (input.slots.length !== length)
    throw invalid(
      "ROTATION_SLOTS_INVALID",
      `Choose a shift or Week Off for each of the ${String(length)} days of the cycle.`,
      "slots",
    );
  const slots: RotationSlot[] = input.slots.map((slot) =>
    slot == null || slot.trim() === ""
      ? Object.freeze({ kind: "week_off" as const })
      : Object.freeze({ kind: "shift" as const, shiftTemplateId: slot }),
  );
  if (slots.every((slot) => slot.kind === "week_off"))
    throw invalid(
      "ROTATION_ALL_WEEK_OFF",
      "At least one day of the cycle must be a shift.",
      "slots",
    );
  return Object.freeze({
    name,
    type: input.type,
    daysPerCycle: length,
    slots: Object.freeze(slots),
    isActive: input.isActive,
  });
}

/** The distinct shift templates a rotation's slots point at. */
export function slotShiftIds(slots: readonly RotationSlot[]): string[] {
  return [
    ...new Set(
      slots.flatMap((slot) =>
        slot.kind === "shift" ? [slot.shiftTemplateId] : [],
      ),
    ),
  ];
}

/**
 * Every slot must point at a live shift of the Company, and an active one
 * unless the rotation already used it (`keep`: an edit need not drop a
 * shift that was marked inactive later). `shifts` maps the Company's live
 * shift templates by id to whether each is active.
 */
export function assertSlotShiftsUsable(
  slots: readonly RotationSlot[],
  shifts: ReadonlyMap<string, { isActive: boolean }>,
  keep: ReadonlySet<string> = new Set(),
): void {
  for (const id of slotShiftIds(slots)) {
    const shift = shifts.get(id);
    if (shift == null)
      throw invalid(
        "ROTATION_SHIFT_NOT_FOUND",
        "A day of the cycle names a shift that does not exist.",
        "slots",
      );
    if (!shift.isActive && !keep.has(id))
      throw invalid(
        "ROTATION_SHIFT_INACTIVE",
        "A day of the cycle names an inactive shift. Choose an active shift.",
        "slots",
      );
  }
}

/** 409: a template some rotation or assignment uses cannot be deleted. */
export function templateInUse(kind: "shift" | "rotation"): DomainError {
  return new DomainError(
    kind === "shift" ? "SHIFT_TEMPLATE_IN_USE" : "ROTATION_TEMPLATE_IN_USE",
    kind === "shift"
      ? "This shift is used by a rotation or a shift assignment, so it cannot be deleted. Mark it inactive instead."
      : "This rotation is assigned to members, so it cannot be deleted. Mark it inactive instead.",
    { kind: "conflict" },
  );
}
