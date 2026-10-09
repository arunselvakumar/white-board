import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  Labour,
  assertTransferDate,
  checkLabourDetails,
  labourDetails,
  maskAadhaar,
  openingBalance,
  type LabourDetailsInput,
} from "./labour";

const VALID_AADHAAR = "234123412346";

const BASE: LabourDetailsInput = {
  name: "  Dhuresh   Nawin ",
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

describe("labourDetails", () => {
  it("tidies a daily-wage Labour", () => {
    const details = labourDetails({
      ...BASE,
      labourCode: " L-01 ",
      weeklyHolidays: [6, 0],
      contactNumber: "77081 65767",
      aadhaar: "2341 2341 2346",
      gender: "male",
    });
    expect(details).toMatchObject({
      name: "Dhuresh Nawin",
      labourCode: "L-01",
      wageType: "daily",
      wagePerDay: 70_000,
      wagePerMonth: null,
      overtimeWagePerHour: 10_000,
      weeklyHolidays: [0, 6],
      contactNumber: "+917708165767",
      aadhaar: VALID_AADHAAR,
      gender: "male",
    });
  });

  it("requires the wage of the chosen wage type, more than zero", () => {
    expect(codeOf(() => labourDetails({ ...BASE, wagePerDay: null }))).toBe(
      "WAGE_REQUIRED",
    );
    expect(codeOf(() => labourDetails({ ...BASE, wagePerDay: 0 }))).toBe(
      "WAGE_REQUIRED",
    );
    expect(codeOf(() => labourDetails({ ...BASE, wagePerDay: -5 }))).toBe(
      "WAGE_INVALID",
    );
    expect(codeOf(() => labourDetails({ ...BASE, wagePerDay: 10.5 }))).toBe(
      "WAGE_INVALID",
    );
    expect(
      codeOf(() =>
        labourDetails({ ...BASE, wageType: "monthly", wagePerMonth: null }),
      ),
    ).toBe("WAGE_REQUIRED");
  });

  it("clears the other wage when the wage type changes", () => {
    const monthly = labourDetails({
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
      labourDetails({ ...BASE, overtimeWagePerHour: 0 }).overtimeWagePerHour,
    ).toBe(0);
    expect(
      codeOf(() => labourDetails({ ...BASE, overtimeWagePerHour: -1 })),
    ).toBe("OVERTIME_WAGE_INVALID");
    expect(
      codeOf(() => labourDetails({ ...BASE, overtimeWagePerHour: null })),
    ).toBe("OVERTIME_WAGE_REQUIRED");
  });

  it("takes working hours a day, 8 when left out", () => {
    expect(labourDetails(BASE).workingHoursPerDay).toBe("8");
    expect(
      labourDetails({ ...BASE, workingHoursPerDay: null }).workingHoursPerDay,
    ).toBe("8");
    expect(
      labourDetails({ ...BASE, workingHoursPerDay: " " }).workingHoursPerDay,
    ).toBe("8");
    expect(
      labourDetails({ ...BASE, workingHoursPerDay: "8.50" }).workingHoursPerDay,
    ).toBe("8.5");
    expect(
      labourDetails({ ...BASE, workingHoursPerDay: 12 }).workingHoursPerDay,
    ).toBe("12");
    for (const bad of [0, 25, "8.123", "abc"])
      expect(
        codeOf(() => labourDetails({ ...BASE, workingHoursPerDay: bad })),
      ).toBe("WORKING_HOURS_INVALID");
  });

  it("checks names, dates, weekdays and statutory numbers", () => {
    expect(codeOf(() => labourDetails({ ...BASE, name: " " }))).toBe(
      "LABOUR_NAME_REQUIRED",
    );
    expect(
      codeOf(() => labourDetails({ ...BASE, joiningDate: "2026-02-30" })),
    ).toBe("JOINING_DATE_INVALID");
    expect(codeOf(() => labourDetails({ ...BASE, wageType: "weekly" }))).toBe(
      "WAGE_TYPE_INVALID",
    );
    expect(
      codeOf(() => labourDetails({ ...BASE, weeklyHolidays: [0, 0] })),
    ).toBe("WEEKLY_HOLIDAYS_INVALID");
    expect(codeOf(() => labourDetails({ ...BASE, weeklyHolidays: [7] }))).toBe(
      "WEEKLY_HOLIDAYS_INVALID",
    );
    expect(codeOf(() => labourDetails({ ...BASE, uanNumber: "12345" }))).toBe(
      "UAN_INVALID",
    );
    expect(
      labourDetails({ ...BASE, uanNumber: "1001 2345 6789" }).uanNumber,
    ).toBe("100123456789");
    expect(
      codeOf(() => labourDetails({ ...BASE, esicNumber: "123456789012" })),
    ).toBe("ESIC_INVALID");
    expect(
      labourDetails({ ...BASE, esicNumber: "1234567890" }).esicNumber,
    ).toBe("1234567890");
    expect(
      labourDetails({ ...BASE, esicNumber: "12345678901234567" }).esicNumber,
    ).toBe("12345678901234567");
    expect(
      codeOf(() => labourDetails({ ...BASE, aadhaar: "234123412345" })),
    ).toBe("AADHAAR_INVALID");
    expect(
      codeOf(() => labourDetails({ ...BASE, contactNumber: "12345" })),
    ).toBe("MOBILE_INVALID");
    expect(codeOf(() => labourDetails({ ...BASE, gender: "x" }))).toBe(
      "GENDER_INVALID",
    );
  });

  it("lists every problem at once for the import preview", () => {
    const checked = checkLabourDetails({
      ...BASE,
      name: "",
      wagePerDay: null,
      uanNumber: "1",
    });
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

describe("Labour", () => {
  const now = new Date("2026-10-08T06:00:00Z");
  const labour = () =>
    Labour.create({
      id: "l1",
      workspaceId: "w1",
      details: labourDetails(BASE),
      projectId: "p1",
      by: "u1",
      now,
    });

  it("refuses a transfer to the Project it is on", () => {
    const item = labour();
    expect(codeOf(() => item.transferTo("p1", "u1", now))).toBe(
      "TRANSFER_SAME_PROJECT",
    );
    expect(item.transferTo("p2", "u1", now)).toBe("p1");
    expect(item.currentProjectId).toBe("p2");
  });

  it("toggles active and stops after delete", () => {
    const item = labour();
    item.deactivate("u1", now);
    expect(item.isActive).toBe(false);
    item.activate("u1", now);
    expect(item.isActive).toBe(true);
    item.delete("u1", now);
    expect(
      codeOf(() => {
        item.deactivate("u1", now);
      }),
    ).toBe("LABOUR_NOT_FOUND");
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
