import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  Employee,
  assertTransferDate,
  checkEmployeeDetails,
  employeeDetails as check,
  maskAadhaar,
  openingBalance,
  type EmployeeDetailsInput,
} from "./employee";

const VALID_AADHAAR = "234123412346";

const TODAY = "2026-10-08";

const BASE: EmployeeDetailsInput = {
  name: "  Dhuresh   Nawin ",
  roleId: "role-labour",
  joiningDate: "2026-10-01",
  wageType: "daily",
  wagePerDay: 70_000,
  overtimeWagePerHour: 10_000,
};

function codeOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  return undefined;
}

function employeeDetails(input: EmployeeDetailsInput) {
  return check(input, TODAY);
}

describe("employeeDetails", () => {
  it("tidies a daily-wage Employee", () => {
    const details = employeeDetails({
      ...BASE,
      employeeCode: " E-01 ",
      weeklyHolidays: [6, 0],
      mobile: "77081 65767",
      aadhaar: "2341 2341 2346",
      gender: "male",
    });
    expect(details).toMatchObject({
      name: "Dhuresh Nawin",
      employeeCode: "E-01",
      roleId: "role-labour",
      wageType: "daily",
      wagePerDay: 70_000,
      wagePerMonth: null,
      overtimeWagePerHour: 10_000,
      weeklyHolidays: [0, 6],
      mobile: "+917708165767",
      aadhaar: VALID_AADHAAR,
      gender: "male",
    });
  });

  it("requires the wage of the chosen wage type, more than zero", () => {
    expect(codeOf(() => employeeDetails({ ...BASE, wagePerDay: null }))).toBe(
      "WAGE_REQUIRED",
    );
    expect(codeOf(() => employeeDetails({ ...BASE, wagePerDay: 0 }))).toBe(
      "WAGE_REQUIRED",
    );
    expect(codeOf(() => employeeDetails({ ...BASE, wagePerDay: -5 }))).toBe(
      "WAGE_INVALID",
    );
    expect(codeOf(() => employeeDetails({ ...BASE, wagePerDay: 10.5 }))).toBe(
      "WAGE_INVALID",
    );
    expect(
      codeOf(() =>
        employeeDetails({ ...BASE, wageType: "monthly", wagePerMonth: null }),
      ),
    ).toBe("WAGE_REQUIRED");
  });

  it("clears the other wage when the wage type changes", () => {
    const monthly = employeeDetails({
      ...BASE,
      wageType: "monthly",
      wagePerDay: 70_000,
      wagePerMonth: 18_00_000,
    });
    expect(monthly.wagePerDay).toBeNull();
    expect(monthly.wagePerMonth).toBe(18_00_000);
  });

  it("takes an overtime wage of 0 or more", () => {
    expect(
      employeeDetails({ ...BASE, overtimeWagePerHour: 0 }).overtimeWagePerHour,
    ).toBe(0);
    expect(
      codeOf(() => employeeDetails({ ...BASE, overtimeWagePerHour: -1 })),
    ).toBe("OVERTIME_WAGE_INVALID");
    expect(
      codeOf(() => employeeDetails({ ...BASE, overtimeWagePerHour: null })),
    ).toBe("OVERTIME_WAGE_REQUIRED");
  });

  it("takes working hours a day, 8 when left out", () => {
    expect(employeeDetails(BASE).workingHoursPerDay).toBe("8");
    expect(
      employeeDetails({ ...BASE, workingHoursPerDay: null }).workingHoursPerDay,
    ).toBe("8");
    expect(
      employeeDetails({ ...BASE, workingHoursPerDay: " " }).workingHoursPerDay,
    ).toBe("8");
    expect(
      employeeDetails({ ...BASE, workingHoursPerDay: "8.50" })
        .workingHoursPerDay,
    ).toBe("8.5");
    expect(
      employeeDetails({ ...BASE, workingHoursPerDay: 12 }).workingHoursPerDay,
    ).toBe("12");
    for (const bad of [0, 25, "8.123", "abc"])
      expect(
        codeOf(() => employeeDetails({ ...BASE, workingHoursPerDay: bad })),
      ).toBe("WORKING_HOURS_INVALID");
  });

  it("checks names, dates, weekdays and statutory numbers", () => {
    expect(codeOf(() => employeeDetails({ ...BASE, name: " " }))).toBe(
      "EMPLOYEE_NAME_REQUIRED",
    );
    expect(
      codeOf(() => employeeDetails({ ...BASE, joiningDate: "2026-02-30" })),
    ).toBe("JOINING_DATE_INVALID");
    expect(codeOf(() => employeeDetails({ ...BASE, wageType: "weekly" }))).toBe(
      "WAGE_TYPE_INVALID",
    );
    expect(
      codeOf(() => employeeDetails({ ...BASE, weeklyHolidays: [0, 0] })),
    ).toBe("WEEKLY_HOLIDAYS_INVALID");
    expect(
      codeOf(() => employeeDetails({ ...BASE, weeklyHolidays: [7] })),
    ).toBe("WEEKLY_HOLIDAYS_INVALID");
    expect(codeOf(() => employeeDetails({ ...BASE, uanNumber: "12345" }))).toBe(
      "UAN_INVALID",
    );
    expect(
      employeeDetails({ ...BASE, uanNumber: "1001 2345 6789" }).uanNumber,
    ).toBe("100123456789");
    expect(
      codeOf(() => employeeDetails({ ...BASE, esicNumber: "123456789012" })),
    ).toBe("ESIC_INVALID");
    expect(
      employeeDetails({ ...BASE, esicNumber: "1234567890" }).esicNumber,
    ).toBe("1234567890");
    expect(
      employeeDetails({ ...BASE, esicNumber: "12345678901234567" }).esicNumber,
    ).toBe("12345678901234567");
    expect(
      codeOf(() => employeeDetails({ ...BASE, aadhaar: "234123412345" })),
    ).toBe("AADHAAR_INVALID");
    expect(codeOf(() => employeeDetails({ ...BASE, mobile: "12345" }))).toBe(
      "MOBILE_INVALID",
    );
    expect(codeOf(() => employeeDetails({ ...BASE, gender: "x" }))).toBe(
      "GENDER_INVALID",
    );
  });

  it("checks the profile, contact, PAN and bank fields of a Site Engineer", () => {
    const details = employeeDetails({
      ...BASE,
      dateOfBirth: "1990-04-01",
      bloodGroup: "o+",
      email: " Meena@Site.Test ",
      pan: "abcpe1234f",
      qualification: " B.E.  Civil ",
      experienceYears: 6,
      specialisation: "Steel / PEB",
      bankAccountNumber: "1234 5678 9012",
      bankIfsc: "hdfc0001234",
    });
    expect(details).toMatchObject({
      dateOfBirth: "1990-04-01",
      bloodGroup: "O+",
      email: "meena@site.test",
      pan: "ABCPE1234F",
      qualification: "B.E. Civil",
      experienceYears: 6,
      bankAccountNumber: "123456789012",
      bankIfsc: "HDFC0001234",
    });
    expect(codeOf(() => employeeDetails({ ...BASE, dateOfBirth: TODAY }))).toBe(
      "DATE_OF_BIRTH_INVALID",
    );
    expect(
      codeOf(() =>
        employeeDetails({
          ...BASE,
          dateOfBirth: "2026-10-01",
          joiningDate: "2026-10-01",
        }),
      ),
    ).toBe("JOINING_DATE_INVALID");
    expect(codeOf(() => employeeDetails({ ...BASE, bloodGroup: "C+" }))).toBe(
      "BLOOD_GROUP_INVALID",
    );
    expect(codeOf(() => employeeDetails({ ...BASE, email: "meena@" }))).toBe(
      "EMAIL_INVALID",
    );
    expect(codeOf(() => employeeDetails({ ...BASE, pan: "ABCDE1234" }))).toBe(
      "PAN_INVALID",
    );
    expect(
      codeOf(() => employeeDetails({ ...BASE, experienceYears: 61 })),
    ).toBe("EXPERIENCE_INVALID");
    expect(
      codeOf(() => employeeDetails({ ...BASE, bankAccountNumber: "12-3" })),
    ).toBe("ACCOUNT_NUMBER_INVALID");
    expect(
      codeOf(() => employeeDetails({ ...BASE, bankIfsc: "HDFC1234" })),
    ).toBe("IFSC_INVALID");
    expect(codeOf(() => employeeDetails({ ...BASE, roleId: " " }))).toBe(
      "EMPLOYEE_ROLE_REQUIRED",
    );
  });

  it("lists every problem at once for the import preview", () => {
    const checked = checkEmployeeDetails(
      { ...BASE, name: "", wagePerDay: null, uanNumber: "1" },
      TODAY,
    );
    expect(checked.problems.map((problem) => problem.field)).toEqual([
      "name",
      "wagePerDay",
      "uanNumber",
    ]);
  });
});

describe("openingBalance", () => {
  it("is signed paise; negative is an advance", () => {
    expect(openingBalance(undefined)).toBe(0);
    expect(openingBalance(-50_000)).toBe(-50_000);
    expect(() => openingBalance(1.5)).toThrow(DomainError);
  });
});

describe("Employee", () => {
  const now = new Date("2026-10-08T06:00:00Z");
  const employee = () =>
    Employee.create({
      id: "l1",
      workspaceId: "w1",
      details: employeeDetails(BASE),
      projectIds: ["p1", "p3", "p1", " "],
      by: "u1",
      now,
    });

  it("can start on no Project, or on many, each once", () => {
    expect(employee().projectIds).toEqual(["p1", "p3"]);
    const none = Employee.create({
      id: "l2",
      workspaceId: "w1",
      details: employeeDetails(BASE),
      by: "u1",
      now,
    });
    expect(none.projectIds).toEqual([]);
  });

  it("moves from one of its Projects to one it is not on", () => {
    const item = employee();
    expect(
      codeOf(() => {
        item.transfer("p1", "p3", "u1", now);
      }),
    ).toBe("TRANSFER_SAME_PROJECT");
    expect(
      codeOf(() => {
        item.transfer("p1", "p1", "u1", now);
      }),
    ).toBe("TRANSFER_SAME_PROJECT");
    expect(
      codeOf(() => {
        item.transfer("p9", "p2", "u1", now);
      }),
    ).toBe("EMPLOYEE_NOT_ON_PROJECT");
    item.transfer("p1", "p2", "u1", now);
    expect(item.projectIds).toEqual(["p2", "p3"]);
  });

  it("ticks and unticks Projects, telling what changed", () => {
    const item = employee();
    const later = new Date("2026-10-09T06:00:00Z");
    expect(item.setProjects(["p3", "p1"], "u2", later)).toEqual({
      added: [],
      removed: [],
    });
    expect(item.updatedAt).toEqual(now);
    expect(item.setProjects(["p3", "p4"], "u2", later)).toEqual({
      added: ["p4"],
      removed: ["p1"],
    });
    expect(item.projectIds).toEqual(["p3", "p4"]);
    expect(item.updatedBy).toBe("u2");
    expect(item.setProjects([], "u2", later).removed).toEqual(["p3", "p4"]);
    expect(item.projectIds).toEqual([]);
  });

  it("toggles active and stops after delete", () => {
    const item = employee();
    item.deactivate("u1", now);
    expect(item.isActive).toBe(false);
    item.activate("u1", now);
    expect(item.isActive).toBe(true);
    item.delete("u1", now);
    expect(
      codeOf(() => {
        item.deactivate("u1", now);
      }),
    ).toBe("EMPLOYEE_NOT_FOUND");
  });

  it("records and clears its sign-in", () => {
    const item = employee();
    const later = new Date("2026-10-09T06:00:00Z");
    item.setSignIn("m1", "u2", later);
    expect(item.teamMemberId).toBe("m1");
    expect(item.updatedAt).toEqual(later);
    item.setSignIn(null, "u2", later);
    expect(item.teamMemberId).toBeNull();
  });

  it("masks Aadhaar to its last four digits", () => {
    expect(maskAadhaar(VALID_AADHAAR)).toBe("XXXXXXXX2346");
    expect(maskAadhaar(null)).toBeNull();
  });
});

describe("assertTransferDate", () => {
  it("allows the last transfer date or later, after attendance", () => {
    expect(() => {
      assertTransferDate({
        name: "Dhuresh",
        transferDate: "2026-10-05",
        lastTransferDate: "2026-10-05",
        latestAttendanceDate: "2026-10-04",
      });
    }).not.toThrow();
    expect(
      codeOf(() => {
        assertTransferDate({
          name: "Dhuresh",
          transferDate: "2026-10-04",
          lastTransferDate: "2026-10-05",
          latestAttendanceDate: null,
        });
      }),
    ).toBe("TRANSFER_BEFORE_LAST_TRANSFER");
    expect(
      codeOf(() => {
        assertTransferDate({
          name: "Dhuresh",
          transferDate: "2026-10-06",
          lastTransferDate: "2026-10-01",
          latestAttendanceDate: "2026-10-06",
        });
      }),
    ).toBe("TRANSFER_BEFORE_ATTENDANCE");
  });
});
