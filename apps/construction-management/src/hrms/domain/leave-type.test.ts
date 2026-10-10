import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  approvalLevelsFor,
  createLeaveType,
  type LeaveTypeInput,
} from "./leave-type";

const CASUAL: LeaveTypeInput = {
  name: "  Casual   Leave ",
  yearlyLimit: 12,
  isPaid: true,
  requiresApproval: true,
  carryForward: false,
  accrualMode: "upfront",
  allowAdvanceUse: false,
};

const PRIVILEGE: LeaveTypeInput = {
  name: "Privilege Leave",
  yearlyLimit: 15,
  isPaid: true,
  requiresApproval: true,
  carryForward: true,
  maxCarryForward: 15,
  accrualMode: "periodic",
  accrualDay: 1,
  creditPerPeriod: 1.25,
  allowAdvanceUse: false,
};

function fault(input: LeaveTypeInput): { code: string; field: unknown } {
  try {
    createLeaveType(input);
  } catch (error) {
    if (error instanceof DomainError)
      return {
        code: error.code,
        field: (error.details as { field?: unknown } | undefined)?.field,
      };
    throw error;
  }
  throw new Error("expected a DomainError");
}

describe("leave type (CM-310)", () => {
  it("normalises an upfront type and clears what does not apply", () => {
    const type = createLeaveType({
      ...CASUAL,
      maxCarryForward: 5,
      accrualDay: 3,
      creditPerPeriod: 1,
      approvalLevels: 2,
    });
    expect(type).toEqual({
      name: "Casual Leave",
      yearlyLimit: 12,
      isPaid: true,
      requiresApproval: true,
      approvalLevels: 2,
      maxConsecutiveDays: null,
      carryForward: false,
      maxCarryForward: null,
      accrualMode: "upfront",
      accrualFrequency: null,
      accrualDay: null,
      creditPerPeriod: null,
      allowAdvanceUse: false,
      isActive: true,
    });
  });

  it("keeps the accrual settings of a monthly type", () => {
    expect(createLeaveType(PRIVILEGE)).toMatchObject({
      accrualMode: "periodic",
      accrualFrequency: "monthly",
      accrualDay: 1,
      creditPerPeriod: 1.25,
      carryForward: true,
      maxCarryForward: 15,
    });
  });

  it("requires the accrual fields when periodic", () => {
    expect(fault({ ...PRIVILEGE, accrualDay: null })).toEqual({
      code: "ACCRUAL_DAY_REQUIRED",
      field: "accrualDay",
    });
    expect(fault({ ...PRIVILEGE, accrualDay: 29 })).toEqual({
      code: "ACCRUAL_DAY_INVALID",
      field: "accrualDay",
    });
    expect(fault({ ...PRIVILEGE, creditPerPeriod: null })).toEqual({
      code: "CREDIT_PER_PERIOD_REQUIRED",
      field: "creditPerPeriod",
    });
    expect(fault({ ...PRIVILEGE, creditPerPeriod: 0 })).toEqual({
      code: "CREDIT_PER_PERIOD_INVALID",
      field: "creditPerPeriod",
    });
    expect(fault({ ...PRIVILEGE, creditPerPeriod: 1.255 })).toEqual({
      code: "CREDIT_PER_PERIOD_INVALID",
      field: "creditPerPeriod",
    });
    expect(fault({ ...PRIVILEGE, creditPerPeriod: 16 })).toEqual({
      code: "CREDIT_PER_PERIOD_INVALID",
      field: "creditPerPeriod",
    });
    expect(fault({ ...PRIVILEGE, yearlyLimit: 0 })).toEqual({
      code: "YEARLY_LIMIT_REQUIRED_FOR_ACCRUAL",
      field: "yearlyLimit",
    });
    expect(fault({ ...PRIVILEGE, accrualFrequency: "weekly" })).toEqual({
      code: "ACCRUAL_FREQUENCY_INVALID",
      field: "accrualFrequency",
    });
  });

  it("requires a carry-forward cap only when carrying forward", () => {
    expect(fault({ ...PRIVILEGE, maxCarryForward: null })).toEqual({
      code: "CARRY_FORWARD_MAX_REQUIRED",
      field: "maxCarryForward",
    });
    expect(fault({ ...PRIVILEGE, maxCarryForward: -1 })).toEqual({
      code: "CARRY_FORWARD_MAX_INVALID",
      field: "maxCarryForward",
    });
    expect(fault({ ...PRIVILEGE, maxCarryForward: 367 })).toEqual({
      code: "CARRY_FORWARD_MAX_INVALID",
      field: "maxCarryForward",
    });
    expect(
      createLeaveType({ ...PRIVILEGE, maxCarryForward: 0 }).maxCarryForward,
    ).toBe(0);
  });

  it("checks the name, limits, levels and the most days in one request", () => {
    expect(fault({ ...CASUAL, name: "  " })).toEqual({
      code: "LEAVE_TYPE_NAME_REQUIRED",
      field: "name",
    });
    expect(fault({ ...CASUAL, name: "x".repeat(61) })).toEqual({
      code: "LEAVE_TYPE_NAME_TOO_LONG",
      field: "name",
    });
    expect(fault({ ...CASUAL, yearlyLimit: -1 })).toEqual({
      code: "YEARLY_LIMIT_INVALID",
      field: "yearlyLimit",
    });
    expect(fault({ ...CASUAL, yearlyLimit: 12.345 })).toEqual({
      code: "YEARLY_LIMIT_INVALID",
      field: "yearlyLimit",
    });
    expect(fault({ ...CASUAL, approvalLevels: 3 })).toEqual({
      code: "APPROVAL_LEVELS_INVALID",
      field: "approvalLevels",
    });
    expect(fault({ ...CASUAL, maxConsecutiveDays: 0 })).toEqual({
      code: "MAX_CONSECUTIVE_DAYS_INVALID",
      field: "maxConsecutiveDays",
    });
    expect(fault({ ...CASUAL, maxConsecutiveDays: 1.5 })).toEqual({
      code: "MAX_CONSECUTIVE_DAYS_INVALID",
      field: "maxConsecutiveDays",
    });
    expect(fault({ ...CASUAL, accrualMode: "weekly" })).toEqual({
      code: "ACCRUAL_MODE_INVALID",
      field: "accrualMode",
    });
  });

  it("drops approval levels when no approval is needed", () => {
    const type = createLeaveType({
      ...CASUAL,
      requiresApproval: false,
      approvalLevels: 2,
    });
    expect(type.approvalLevels).toBeNull();
    expect(approvalLevelsFor(type, 2)).toBe(0);
  });

  it("uses the type's levels over the Settings'", () => {
    expect(
      approvalLevelsFor(createLeaveType({ ...CASUAL, approvalLevels: 2 }), 1),
    ).toBe(2);
    expect(approvalLevelsFor(createLeaveType(CASUAL), 2)).toBe(2);
    expect(approvalLevelsFor(createLeaveType(CASUAL), 1)).toBe(1);
  });
});
