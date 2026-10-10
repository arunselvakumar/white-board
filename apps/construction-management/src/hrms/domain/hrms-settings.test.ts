import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  createHrmsSettings,
  DEFAULT_HRMS_SETTINGS,
  isSettingsWorkingDay,
  type HrmsSettingsInput,
} from "./hrms-settings";

const VALID: HrmsSettingsInput = {
  gpsRequirement: "required",
  graceMinutes: 10,
  workingHoursPerDay: 9,
  halfDayHours: 4.5,
  workingDays: [6, 1, 2, 3, 4, 5],
  leaveApprovalLevels: 2,
  leaveYear: "financial",
  carryForwardEnabled: true,
  carryForwardMaxDays: 15,
  leaveAccrualEnabled: true,
  autoSalaryCalculation: true,
  salaryCalculationDay: 28,
  ptStateCode: "33",
};

function errorOf(change: Partial<HrmsSettingsInput>): {
  code: string;
  field: unknown;
} {
  try {
    createHrmsSettings({ ...VALID, ...change });
  } catch (error) {
    if (error instanceof DomainError)
      return {
        code: error.code,
        field: (error.details as { field?: unknown } | undefined)?.field,
      };
    throw error;
  }
  throw new Error("Expected a DomainError");
}

describe("DEFAULT_HRMS_SETTINGS (ADR CM-0012)", () => {
  it("is the legacy values: 15 min, 8 h, 4 h, Mon–Fri, 1 level, calendar, GPS off", () => {
    expect(DEFAULT_HRMS_SETTINGS).toEqual({
      gpsRequirement: "disabled",
      graceMinutes: 15,
      workingHoursPerDay: 8,
      halfDayHours: 4,
      workingDays: [1, 2, 3, 4, 5],
      leaveApprovalLevels: 1,
      leaveYear: "calendar",
      carryForwardEnabled: false,
      carryForwardMaxDays: null,
      leaveAccrualEnabled: false,
      autoSalaryCalculation: false,
      salaryCalculationDay: null,
      ptStateCode: null,
    });
  });

  it("passes its own rules", () => {
    expect(createHrmsSettings(DEFAULT_HRMS_SETTINGS)).toEqual(
      DEFAULT_HRMS_SETTINGS,
    );
  });
});

describe("createHrmsSettings", () => {
  it("keeps valid settings and sorts the working days", () => {
    const settings = createHrmsSettings(VALID);
    expect(settings.workingDays).toEqual([1, 2, 3, 4, 5, 6]);
    expect(settings).toMatchObject({
      gpsRequirement: "required",
      halfDayHours: 4.5,
      carryForwardMaxDays: 15,
      salaryCalculationDay: 28,
      ptStateCode: "33",
    });
  });

  it("refuses an unknown GPS mode", () => {
    expect(errorOf({ gpsRequirement: "optional" })).toEqual({
      code: "GPS_REQUIREMENT_INVALID",
      field: "gpsRequirement",
    });
  });

  it("keeps the grace period between 0 and 120 whole minutes", () => {
    expect(() =>
      createHrmsSettings({ ...VALID, graceMinutes: 0 }),
    ).not.toThrow();
    expect(() =>
      createHrmsSettings({ ...VALID, graceMinutes: 120 }),
    ).not.toThrow();
    for (const graceMinutes of [-1, 121, 2.5, Number.NaN])
      expect(errorOf({ graceMinutes }).code).toBe("GRACE_MINUTES_INVALID");
  });

  it("keeps working hours above 0, at most 24, with two decimals", () => {
    expect(
      createHrmsSettings({ ...VALID, workingHoursPerDay: 7.75 })
        .workingHoursPerDay,
    ).toBe(7.75);
    expect(
      createHrmsSettings({ ...VALID, workingHoursPerDay: 24, halfDayHours: 12 })
        .workingHoursPerDay,
    ).toBe(24);
    for (const workingHoursPerDay of [0, -8, 24.01, 8.125])
      expect(errorOf({ workingHoursPerDay })).toEqual({
        code: "WORKING_HOURS_INVALID",
        field: "workingHoursPerDay",
      });
  });

  it("keeps half-day hours above 0 and below the working hours", () => {
    for (const halfDayHours of [0, 9, 9.5, 4.555])
      expect(errorOf({ halfDayHours })).toEqual({
        code: "HALF_DAY_HOURS_INVALID",
        field: "halfDayHours",
      });
    expect(
      createHrmsSettings({ ...VALID, halfDayHours: 8.99 }).halfDayHours,
    ).toBe(8.99);
  });

  it("needs at least one working day, each a unique ISO weekday", () => {
    for (const workingDays of [[], [0], [8], [1, 1], [1.5]])
      expect(errorOf({ workingDays })).toEqual({
        code: "WORKING_DAYS_INVALID",
        field: "workingDays",
      });
    expect(
      createHrmsSettings({ ...VALID, workingDays: [7] }).workingDays,
    ).toEqual([7]);
  });

  it("allows 1 or 2 leave approval levels", () => {
    for (const leaveApprovalLevels of [0, 3, 1.5])
      expect(errorOf({ leaveApprovalLevels }).code).toBe(
        "APPROVAL_LEVELS_INVALID",
      );
  });

  it("allows a calendar or financial leave year only", () => {
    expect(errorOf({ leaveYear: "academic" })).toEqual({
      code: "LEAVE_YEAR_INVALID",
      field: "leaveYear",
    });
  });

  it("needs the carry-forward cap only when carry forward is on", () => {
    expect(errorOf({ carryForwardMaxDays: null }).code).toBe(
      "CARRY_FORWARD_MAX_REQUIRED",
    );
    expect(errorOf({ carryForwardMaxDays: -1 }).code).toBe(
      "CARRY_FORWARD_MAX_INVALID",
    );
    expect(errorOf({ carryForwardMaxDays: 1.234 }).code).toBe(
      "CARRY_FORWARD_MAX_INVALID",
    );
    expect(
      createHrmsSettings({ ...VALID, carryForwardMaxDays: 0 })
        .carryForwardMaxDays,
    ).toBe(0);
    const off = createHrmsSettings({
      ...VALID,
      carryForwardEnabled: false,
      carryForwardMaxDays: 30,
    });
    expect(off.carryForwardMaxDays).toBeNull();
  });

  it("needs a salary day 1–28 only when salaries are calculated automatically", () => {
    expect(errorOf({ salaryCalculationDay: null })).toEqual({
      code: "SALARY_DAY_REQUIRED",
      field: "salaryCalculationDay",
    });
    for (const salaryCalculationDay of [0, 29, 31, 1.5])
      expect(errorOf({ salaryCalculationDay }).code).toBe("SALARY_DAY_INVALID");
    const manual = createHrmsSettings({
      ...VALID,
      autoSalaryCalculation: false,
      salaryCalculationDay: 31,
    });
    expect(manual.salaryCalculationDay).toBeNull();
  });

  it("takes a PT state from the GST state list, or none", () => {
    expect(errorOf({ ptStateCode: "28" })).toEqual({
      code: "PT_STATE_INVALID",
      field: "ptStateCode",
    });
    expect(errorOf({ ptStateCode: "KA" }).code).toBe("PT_STATE_INVALID");
    expect(createHrmsSettings({ ...VALID, ptStateCode: "" }).ptStateCode).toBe(
      null,
    );
    expect(
      createHrmsSettings({ ...VALID, ptStateCode: null }).ptStateCode,
    ).toBeNull();
  });
});

describe("isSettingsWorkingDay", () => {
  it("follows the working weekdays", () => {
    expect(isSettingsWorkingDay(DEFAULT_HRMS_SETTINGS, "2026-10-09")).toBe(
      true,
    ); // Friday
    expect(isSettingsWorkingDay(DEFAULT_HRMS_SETTINGS, "2026-10-10")).toBe(
      false,
    ); // Saturday
  });
});
