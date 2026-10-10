import type { StoredHrmsSettings } from "@/src/hrms/application/hrms-settings-handlers";

import type { GetConstructionHrmsSettingsResponseModel } from "./get-hrms-settings-response-model";

export function mapHrmsSettings(
  stored: StoredHrmsSettings,
): GetConstructionHrmsSettingsResponseModel {
  const { settings } = stored;
  return {
    gpsRequirement: settings.gpsRequirement,
    graceMinutes: settings.graceMinutes,
    workingHoursPerDay: settings.workingHoursPerDay,
    halfDayHours: settings.halfDayHours,
    workingDays: [...settings.workingDays],
    leaveApprovalLevels: settings.leaveApprovalLevels,
    leaveYear: settings.leaveYear,
    carryForwardEnabled: settings.carryForwardEnabled,
    carryForwardMaxDays: settings.carryForwardMaxDays,
    leaveAccrualEnabled: settings.leaveAccrualEnabled,
    autoSalaryCalculation: settings.autoSalaryCalculation,
    salaryCalculationDay: settings.salaryCalculationDay,
    ptStateCode: settings.ptStateCode,
    updatedAt: stored.updatedAt?.toISOString() ?? null,
  };
}
