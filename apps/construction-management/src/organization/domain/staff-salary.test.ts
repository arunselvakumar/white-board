import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import { MAX_SALARY, NO_SALARY, sameSalary, staffSalary } from "./staff-salary";

function codeOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  return undefined;
}

describe("staffSalary (ADR CM-0033 §3)", () => {
  it("starts Monthly with no salary, 8 hours and Sundays off", () => {
    expect(staffSalary({})).toEqual(NO_SALARY);
  });

  it("keeps only the amount of the chosen type", () => {
    expect(
      staffSalary({
        type: "daily",
        perDay: 80_000,
        perMonth: 2_500_000,
        overtimePerHour: 10_000,
        workingHoursPerDay: "9.5",
        weeklyHolidays: [6, 0],
      }),
    ).toEqual({
      type: "daily",
      perDay: 80_000,
      perMonth: null,
      overtimePerHour: 10_000,
      workingHoursPerDay: "9.5",
      weeklyHolidays: [0, 6],
    });
  });

  it("treats 0 as no salary, and drops overtime without a salary", () => {
    const salary = staffSalary({ perMonth: 0, overtimePerHour: 5_000 });
    expect(salary.perMonth).toBeNull();
    expect(salary.overtimePerHour).toBe(0);
  });

  it("caps the salary at ₹2 crore", () => {
    expect(staffSalary({ perMonth: MAX_SALARY }).perMonth).toBe(MAX_SALARY);
    expect(codeOf(() => staffSalary({ perMonth: MAX_SALARY + 1 }))).toBe(
      "SALARY_INVALID",
    );
    expect(codeOf(() => staffSalary({ perMonth: -1 }))).toBe("SALARY_INVALID");
    expect(codeOf(() => staffSalary({ perDay: 1.5, type: "daily" }))).toBe(
      "SALARY_INVALID",
    );
  });

  it("refuses a bad type, overtime, hours or holidays", () => {
    expect(codeOf(() => staffSalary({ type: "weekly" }))).toBe(
      "SALARY_TYPE_INVALID",
    );
    expect(
      codeOf(() => staffSalary({ perMonth: 100, overtimePerHour: -1 })),
    ).toBe("OVERTIME_WAGE_INVALID");
    for (const hours of ["0", "24.01", "8.125", "eight"])
      expect(codeOf(() => staffSalary({ workingHoursPerDay: hours }))).toBe(
        "WORKING_HOURS_INVALID",
      );
    expect(staffSalary({ workingHoursPerDay: "24" }).workingHoursPerDay).toBe(
      "24",
    );
    expect(staffSalary({ workingHoursPerDay: 8.5 }).workingHoursPerDay).toBe(
      "8.5",
    );
    for (const days of [[7], [0, 0], [1.5]])
      expect(codeOf(() => staffSalary({ weeklyHolidays: days }))).toBe(
        "WEEKLY_HOLIDAYS_INVALID",
      );
  });

  it("compares two set-ups field by field", () => {
    expect(sameSalary(staffSalary({}), NO_SALARY)).toBe(true);
    expect(sameSalary(staffSalary({ weeklyHolidays: [] }), NO_SALARY)).toBe(
      false,
    );
  });
});
