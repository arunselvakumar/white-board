import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  assignmentInForce,
  createLeaveStructure,
  entitlementOf,
  type LeaveStructureInput,
} from "./leave-structure";

const STAFF: LeaveStructureInput = {
  name: " Office  staff ",
  description: "  ",
  lines: [
    { leaveTypeId: "casual", entitlementDays: 10 },
    { leaveTypeId: "sick" },
  ],
};

function codeOf(input: LeaveStructureInput): string {
  try {
    createLeaveStructure(input);
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  return "none";
}

describe("leave structure (CM-311)", () => {
  it("normalises the name and lines", () => {
    expect(createLeaveStructure(STAFF)).toEqual({
      name: "Office staff",
      description: null,
      lines: [
        { leaveTypeId: "casual", entitlementDays: 10 },
        { leaveTypeId: "sick", entitlementDays: null },
      ],
    });
  });

  it("needs a name and at least one leave type, each once", () => {
    expect(codeOf({ ...STAFF, name: "" })).toBe(
      "LEAVE_STRUCTURE_NAME_REQUIRED",
    );
    expect(codeOf({ ...STAFF, lines: [] })).toBe(
      "LEAVE_STRUCTURE_LINES_REQUIRED",
    );
    expect(
      codeOf({
        ...STAFF,
        lines: [{ leaveTypeId: "casual" }, { leaveTypeId: "casual" }],
      }),
    ).toBe("LEAVE_STRUCTURE_LINE_DUPLICATE");
    expect(
      codeOf({
        ...STAFF,
        lines: [{ leaveTypeId: "casual", entitlementDays: -1 }],
      }),
    ).toBe("LEAVE_ENTITLEMENT_INVALID");
    expect(
      codeOf({
        ...STAFF,
        lines: [{ leaveTypeId: "casual", entitlementDays: 1.234 }],
      }),
    ).toBe("LEAVE_ENTITLEMENT_INVALID");
  });

  it("uses the line's entitlement, else the yearly limit", () => {
    expect(entitlementOf({ entitlementDays: 10 }, { yearlyLimit: 12 })).toBe(
      10,
    );
    expect(entitlementOf({ entitlementDays: null }, { yearlyLimit: 12 })).toBe(
      12,
    );
    expect(entitlementOf(null, { yearlyLimit: 12 })).toBe(12);
  });

  it("finds the assignment in force: the latest on or before the date", () => {
    const assignments = [
      { id: "a", effectiveFrom: "2026-01-01" },
      { id: "c", effectiveFrom: "2026-11-01" },
      { id: "b", effectiveFrom: "2026-06-01" },
    ];
    expect(assignmentInForce(assignments, "2025-12-31")).toBeNull();
    expect(assignmentInForce(assignments, "2026-06-01")?.id).toBe("b");
    expect(assignmentInForce(assignments, "2026-10-10")?.id).toBe("b");
    expect(assignmentInForce(assignments, "2027-01-01")?.id).toBe("c");
  });
});
