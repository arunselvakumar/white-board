import { describe, expect, it } from "vitest";

import {
  addedParentEmails,
  ageText,
  assertChildActive,
  assertParentPhone,
  assertPickupCount,
  childName,
  formatAdmissionNumber,
  normaliseEmail,
} from "./child";
import { PreschoolError } from "./errors";
import { normaliseIndianMobile, optionalIndianMobile } from "./phone";

function codeOf(work: () => unknown): string | null {
  try {
    work();
    return null;
  } catch (error) {
    if (error instanceof PreschoolError) return error.code;
    throw error;
  }
}

describe("formatAdmissionNumber", () => {
  it("is the Centre code and a 4-digit sequence", () => {
    expect(formatAdmissionNumber("MAIN", 7)).toBe("MAIN-0007");
    expect(formatAdmissionNumber("B2", 1234)).toBe("B2-1234");
  });

  it("keeps every digit past 9999", () => {
    expect(formatAdmissionNumber("B2", 12345)).toBe("B2-12345");
  });
});

describe("parents", () => {
  it("need at least one phone", () => {
    expect(
      codeOf(() => assertParentPhone({ fatherPhone: null, motherPhone: null })),
    ).toBe("PARENT_PHONE_REQUIRED");
    expect(
      codeOf(() =>
        assertParentPhone({ fatherPhone: null, motherPhone: "9876543210" }),
      ),
    ).toBeNull();
  });

  it("are invited only for emails that are new on the record", () => {
    expect(
      addedParentEmails(
        ["ravi@example.test", null],
        ["ravi@example.test", "meera@example.test"],
      ),
    ).toEqual(["meera@example.test"]);
    expect(addedParentEmails([], ["a@example.test", "a@example.test"])).toEqual(
      ["a@example.test"],
    );
  });

  it("have lower-case emails", () => {
    expect(normaliseEmail("  Ravi@Example.TEST ")).toBe("ravi@example.test");
    expect(normaliseEmail("  ")).toBeNull();
    expect(normaliseEmail(null)).toBeNull();
  });
});

describe("Indian mobile numbers", () => {
  it("accept 10 digits with an optional +91, 91 or 0 prefix", () => {
    for (const raw of [
      "9876543210",
      "+91 98765 43210",
      "+919876543210",
      "919876543210",
      "09876543210",
      "98765-43210",
    ])
      expect(normaliseIndianMobile(raw)).toBe("9876543210");
    expect(normaliseIndianMobile("9187654321")).toBe("9187654321");
  });

  it("refuse landlines, short numbers and other countries", () => {
    for (const raw of ["044 2345 6789", "98765", "+1 415 555 0100", "abc"])
      expect(normaliseIndianMobile(raw)).toBeNull();
    expect(codeOf(() => optionalIndianMobile("12345", "fatherPhone"))).toBe(
      "PHONE_INVALID",
    );
    expect(optionalIndianMobile(" ", "fatherPhone")).toBeNull();
  });
});

describe("a Child's record", () => {
  it("can only be read after withdrawal or graduation", () => {
    expect(codeOf(() => assertChildActive("active"))).toBeNull();
    expect(codeOf(() => assertChildActive("withdrawn"))).toBe(
      "CHILD_NOT_ACTIVE",
    );
    expect(codeOf(() => assertChildActive("graduated"))).toBe(
      "CHILD_NOT_ACTIVE",
    );
  });

  it("has at most six Authorised Pickups", () => {
    expect(codeOf(() => assertPickupCount(6))).toBeNull();
    expect(codeOf(() => assertPickupCount(7))).toBe("TOO_MANY_PICKUPS");
  });

  it("names and ages the Child", () => {
    expect(childName("Aarav", null)).toBe("Aarav");
    expect(childName("Aarav", "Kumar")).toBe("Aarav Kumar");
    expect(ageText("2023-03-10", "2026-11-25")).toBe("3 y 8 m");
  });
});
