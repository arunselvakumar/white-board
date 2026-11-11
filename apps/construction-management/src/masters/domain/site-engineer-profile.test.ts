import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import { siteEngineerBank, siteEngineerProfile } from "./site-engineer-profile";

const TODAY = "2026-11-11";

function codeOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  return undefined;
}

describe("siteEngineerProfile", () => {
  it("tidies text and leaves blanks empty", () => {
    expect(
      siteEngineerProfile(
        {
          employeeCode: "  SE   7 ",
          fatherName: "",
          gender: "female",
          bloodGroup: "ab-",
          qualification: " Diploma  in Civil ",
          specialisation: null,
        },
        TODAY,
      ),
    ).toEqual({
      employeeCode: "SE 7",
      fatherName: null,
      dateOfBirth: null,
      gender: "female",
      bloodGroup: "AB-",
      joiningDate: null,
      qualification: "Diploma in Civil",
      experienceYears: null,
      specialisation: null,
    });
  });

  it("checks dates, gender, blood group, experience and lengths", () => {
    const check = (input: Parameters<typeof siteEngineerProfile>[0]) =>
      codeOf(() => siteEngineerProfile(input, TODAY));
    expect(check({ dateOfBirth: "1990-02-30" })).toBe("DATE_OF_BIRTH_INVALID");
    expect(check({ dateOfBirth: TODAY })).toBe("DATE_OF_BIRTH_INVALID");
    expect(
      check({ dateOfBirth: "1990-01-01", joiningDate: "1989-12-31" }),
    ).toBe("JOINING_DATE_INVALID");
    expect(check({ joiningDate: "2027-01-01" })).toBeUndefined();
    expect(check({ gender: "unknown" })).toBe("GENDER_INVALID");
    expect(check({ bloodGroup: "C+" })).toBe("BLOOD_GROUP_INVALID");
    expect(check({ experienceYears: 2.5 })).toBe("EXPERIENCE_INVALID");
    expect(check({ experienceYears: 61 })).toBe("EXPERIENCE_INVALID");
    expect(check({ employeeCode: "x".repeat(31) })).toBe(
      "EMPLOYEE_CODE_TOO_LONG",
    );
  });
});

describe("siteEngineerBank", () => {
  it("normalises the account number and IFSC", () => {
    expect(
      siteEngineerBank({
        accountHolder: " Karthik  Raja ",
        accountNumber: "5010-0123 4567",
        ifsc: " hdfc0001234 ",
        bankName: "HDFC Bank",
      }),
    ).toEqual({
      accountHolder: "Karthik Raja",
      accountNumber: "501001234567",
      ifsc: "HDFC0001234",
      bankName: "HDFC Bank",
    });
  });

  it("refuses a bad account number or IFSC", () => {
    expect(codeOf(() => siteEngineerBank({ accountNumber: "12-3" }))).toBe(
      "ACCOUNT_NUMBER_INVALID",
    );
    expect(codeOf(() => siteEngineerBank({ ifsc: "HDFC1001234" }))).toBe(
      "IFSC_INVALID",
    );
  });
});
