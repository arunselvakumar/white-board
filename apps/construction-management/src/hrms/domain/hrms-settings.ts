import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";
import { isGstStateCode } from "@/src/shared-kernel/gst-states";

import { isIsoWeekday, isoWeekday, type IsoWeekday } from "./calendar";
import { LEAVE_YEAR_SETTINGS, type LeaveYearSetting } from "./leave-year";

/**
 * HRMS Settings (CM-303, `modules/10` "HrmsSettings", ADR CM-0012): the
 * Company-wide rules attendance, leave and salary start from. One per
 * Company; a Company that never saved them has `DEFAULT_HRMS_SETTINGS`.
 * Every value is checked here; the database repeats the rules as CHECK
 * constraints.
 */

/** How check-in treats the device location (ADR CM-0012 §1). */
export const GPS_REQUIREMENTS = [
  "disabled",
  "record_only",
  "required",
] as const;

export type GpsRequirement = (typeof GPS_REQUIREMENTS)[number];

export const HRMS_SETTINGS_LIMITS = {
  maxGraceMinutes: 120,
  maxWorkingHours: 24,
  maxApprovalLevels: 2,
  maxCarryForwardDays: 999.99,
  /** The 29th–31st do not exist in every month. */
  maxSalaryCalculationDay: 28,
} as const;

export type HrmsSettings = Readonly<{
  gpsRequirement: GpsRequirement;
  /** Minutes of late check-in tolerated; a shift's own grace wins. */
  graceMinutes: number;
  /** Hours, two decimals at most. */
  workingHoursPerDay: number;
  /** Hours worked that make a half day; below `workingHoursPerDay`. */
  halfDayHours: number;
  /** ISO weekdays, ascending, no repeats. */
  workingDays: readonly IsoWeekday[];
  /** Approval steps for a leave request; a leave type may set its own. */
  leaveApprovalLevels: 1 | 2;
  leaveYear: LeaveYearSetting;
  carryForwardEnabled: boolean;
  /** Days; set exactly when carry forward is enabled. */
  carryForwardMaxDays: number | null;
  leaveAccrualEnabled: boolean;
  autoSalaryCalculation: boolean;
  /** Day of the month, 1–28; set exactly when auto salary calculation is on. */
  salaryCalculationDay: number | null;
  /** GST state code whose PT slabs apply (ADR CM-0008); null = no PT by slab. */
  ptStateCode: string | null;
}>;

/** What a save sends; optional values are ignored when their switch is off. */
export type HrmsSettingsInput = {
  gpsRequirement: string;
  graceMinutes: number;
  workingHoursPerDay: number;
  halfDayHours: number;
  workingDays: readonly number[];
  leaveApprovalLevels: number;
  leaveYear: string;
  carryForwardEnabled: boolean;
  carryForwardMaxDays?: number | null;
  leaveAccrualEnabled: boolean;
  autoSalaryCalculation: boolean;
  salaryCalculationDay?: number | null;
  ptStateCode?: string | null;
};

/** The legacy app's values (`modules/10`) and ADR CM-0012's defaults. */
export const DEFAULT_HRMS_SETTINGS: HrmsSettings = Object.freeze({
  gpsRequirement: "disabled",
  graceMinutes: 15,
  workingHoursPerDay: 8,
  halfDayHours: 4,
  workingDays: Object.freeze([1, 2, 3, 4, 5] as IsoWeekday[]),
  leaveApprovalLevels: 1,
  leaveYear: "calendar",
  carryForwardEnabled: false,
  carryForwardMaxDays: null,
  leaveAccrualEnabled: false,
  autoSalaryCalculation: false,
  salaryCalculationDay: null,
  ptStateCode: null,
});

function invalid(code: string, message: string, field: string): DomainError {
  return new DomainError(code, message, { details: { field } });
}

/** At most two decimal places, compared without float noise. */
function hasTwoDecimals(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-9;
}

function isGpsRequirement(value: string): value is GpsRequirement {
  return (GPS_REQUIREMENTS as readonly string[]).includes(value);
}

function isLeaveYearSetting(value: string): value is LeaveYearSetting {
  return (LEAVE_YEAR_SETTINGS as readonly string[]).includes(value);
}

function hours(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Validates and normalises a save: working days sorted, values whose
 * switch is off dropped to null. Throws a `DomainError` with
 * `details.field` naming the field at fault.
 */
export function createHrmsSettings(input: HrmsSettingsInput): HrmsSettings {
  if (!isGpsRequirement(input.gpsRequirement))
    throw invalid(
      "GPS_REQUIREMENT_INVALID",
      "Choose Disabled, Record only or Required.",
      "gpsRequirement",
    );

  const { maxGraceMinutes, maxWorkingHours } = HRMS_SETTINGS_LIMITS;
  if (
    !Number.isInteger(input.graceMinutes) ||
    input.graceMinutes < 0 ||
    input.graceMinutes > maxGraceMinutes
  )
    throw invalid(
      "GRACE_MINUTES_INVALID",
      `The grace period is 0 to ${String(maxGraceMinutes)} whole minutes.`,
      "graceMinutes",
    );

  if (
    !Number.isFinite(input.workingHoursPerDay) ||
    input.workingHoursPerDay <= 0 ||
    input.workingHoursPerDay > maxWorkingHours ||
    !hasTwoDecimals(input.workingHoursPerDay)
  )
    throw invalid(
      "WORKING_HOURS_INVALID",
      `Working hours are more than 0 and at most ${String(maxWorkingHours)}, with up to two decimals.`,
      "workingHoursPerDay",
    );

  if (
    !Number.isFinite(input.halfDayHours) ||
    input.halfDayHours <= 0 ||
    !hasTwoDecimals(input.halfDayHours)
  )
    throw invalid(
      "HALF_DAY_HOURS_INVALID",
      "Half-day hours are more than 0, with up to two decimals.",
      "halfDayHours",
    );
  if (input.halfDayHours >= input.workingHoursPerDay)
    throw invalid(
      "HALF_DAY_HOURS_INVALID",
      "Half-day hours must be less than the working hours per day.",
      "halfDayHours",
    );

  const workingDays = [...new Set(input.workingDays)].sort((a, b) => a - b);
  if (
    workingDays.length === 0 ||
    workingDays.length !== input.workingDays.length ||
    !workingDays.every(isIsoWeekday)
  )
    throw invalid(
      "WORKING_DAYS_INVALID",
      "Choose at least one working day, each once.",
      "workingDays",
    );

  const levels = input.leaveApprovalLevels;
  if (levels !== 1 && levels !== 2)
    throw invalid(
      "APPROVAL_LEVELS_INVALID",
      "Leave needs 1 or 2 approval levels.",
      "leaveApprovalLevels",
    );

  if (!isLeaveYearSetting(input.leaveYear))
    throw invalid(
      "LEAVE_YEAR_INVALID",
      "Choose a calendar or a financial leave year.",
      "leaveYear",
    );

  let carryForwardMaxDays: number | null = null;
  if (input.carryForwardEnabled) {
    const max = input.carryForwardMaxDays;
    if (max == null)
      throw invalid(
        "CARRY_FORWARD_MAX_REQUIRED",
        "Enter the most days that can be carried forward.",
        "carryForwardMaxDays",
      );
    if (
      !Number.isFinite(max) ||
      max < 0 ||
      max > HRMS_SETTINGS_LIMITS.maxCarryForwardDays ||
      !hasTwoDecimals(max)
    )
      throw invalid(
        "CARRY_FORWARD_MAX_INVALID",
        "Carry-forward days are 0 or more, with up to two decimals.",
        "carryForwardMaxDays",
      );
    carryForwardMaxDays = hours(max);
  }

  let salaryCalculationDay: number | null = null;
  if (input.autoSalaryCalculation) {
    const day = input.salaryCalculationDay;
    if (day == null)
      throw invalid(
        "SALARY_DAY_REQUIRED",
        "Choose the day of the month salaries are calculated.",
        "salaryCalculationDay",
      );
    if (
      !Number.isInteger(day) ||
      day < 1 ||
      day > HRMS_SETTINGS_LIMITS.maxSalaryCalculationDay
    )
      throw invalid(
        "SALARY_DAY_INVALID",
        `The salary day is 1 to ${String(HRMS_SETTINGS_LIMITS.maxSalaryCalculationDay)}, so it exists in every month.`,
        "salaryCalculationDay",
      );
    salaryCalculationDay = day;
  }

  const ptStateCode = input.ptStateCode?.trim() ?? "";
  if (ptStateCode !== "" && !isGstStateCode(ptStateCode))
    throw invalid(
      "PT_STATE_INVALID",
      "Choose a state from the list.",
      "ptStateCode",
    );

  return Object.freeze({
    gpsRequirement: input.gpsRequirement,
    graceMinutes: input.graceMinutes,
    workingHoursPerDay: hours(input.workingHoursPerDay),
    halfDayHours: hours(input.halfDayHours),
    workingDays: Object.freeze(workingDays),
    leaveApprovalLevels: levels,
    leaveYear: input.leaveYear,
    carryForwardEnabled: input.carryForwardEnabled,
    carryForwardMaxDays,
    leaveAccrualEnabled: input.leaveAccrualEnabled,
    autoSalaryCalculation: input.autoSalaryCalculation,
    salaryCalculationDay,
    ptStateCode: ptStateCode === "" ? null : ptStateCode,
  });
}

/** Whether the Settings make a date a working weekday (holidays aside). */
export function isSettingsWorkingDay(
  settings: HrmsSettings,
  date: CalendarDate,
): boolean {
  return settings.workingDays.includes(isoWeekday(date));
}
