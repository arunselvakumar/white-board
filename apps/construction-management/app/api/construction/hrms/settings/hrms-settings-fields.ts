import { z } from "zod";

import { LEAVE_YEAR_SETTINGS } from "@/src/hrms/domain/leave-year";
import {
  GPS_REQUIREMENTS,
  HRMS_SETTINGS_LIMITS,
} from "@/src/hrms/domain/hrms-settings";

/**
 * HRMS Settings fields shared by the read and the save (CM-303). Shapes
 * only: the hrms domain checks every rule and answers with a code naming
 * the field (`details.field`).
 */
export const hrmsSettingsFields = {
  gpsRequirement: z
    .enum(GPS_REQUIREMENTS)
    .describe(
      "`disabled`: check in without a location. `record_only`: outside every fence goes to approvals. `required`: outside every fence is refused (ADR CM-0012 §1).",
    ),
  graceMinutes: z
    .number()
    .describe(
      `Minutes of late check-in tolerated, 0–${String(HRMS_SETTINGS_LIMITS.maxGraceMinutes)}.`,
    ),
  workingHoursPerDay: z
    .number()
    .describe("More than 0 and at most 24, up to two decimals."),
  halfDayHours: z
    .number()
    .describe("More than 0 and less than the working hours per day."),
  workingDays: z
    .array(z.number())
    .max(7)
    .describe("ISO weekdays, 1 = Monday … 7 = Sunday; at least one, unique."),
  leaveApprovalLevels: z
    .number()
    .describe("1 or 2; a leave type may ask for its own."),
  leaveYear: z
    .enum(LEAVE_YEAR_SETTINGS)
    .describe(
      '`calendar` (January–December, "2026") or `financial` (April–March, "26-27").',
    ),
  carryForwardEnabled: z.boolean(),
  carryForwardMaxDays: z
    .number()
    .nullable()
    .describe("Days, 0 or more; required when carry forward is enabled."),
  leaveAccrualEnabled: z.boolean(),
  autoSalaryCalculation: z.boolean(),
  salaryCalculationDay: z
    .number()
    .nullable()
    .describe(
      `Day of the month, 1–${String(HRMS_SETTINGS_LIMITS.maxSalaryCalculationDay)}; required when auto salary calculation is on.`,
    ),
  ptStateCode: z
    .string()
    .nullable()
    .describe(
      "GST state code (two digits) whose professional tax slabs apply; null for none.",
    ),
};
