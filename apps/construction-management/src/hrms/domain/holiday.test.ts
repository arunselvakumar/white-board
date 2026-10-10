import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  createHoliday,
  holidayDateTaken,
  holidayTypeFromLabel,
  isDayOff,
  repeatedDates,
} from "./holiday";

const DIWALI = {
  name: " Diwali ",
  date: "2026-11-08",
  type: "festival",
  isOptional: false,
  description: "  ",
};

function codeOf(run: () => unknown): { code: string; field: unknown } {
  try {
    run();
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

describe("createHoliday", () => {
  it("trims the name and drops a blank description", () => {
    expect(createHoliday(DIWALI)).toEqual({
      name: "Diwali",
      date: "2026-11-08",
      type: "festival",
      isOptional: false,
      description: null,
    });
  });

  it("takes each of the three types", () => {
    for (const type of ["national", "festival", "company"])
      expect(createHoliday({ ...DIWALI, type }).type).toBe(type);
    expect(codeOf(() => createHoliday({ ...DIWALI, type: "bank" }))).toEqual({
      code: "HOLIDAY_TYPE_INVALID",
      field: "type",
    });
  });

  it("keeps the optional flag (a working day unless taken as leave)", () => {
    const optional = createHoliday({ ...DIWALI, isOptional: true });
    expect(optional.isOptional).toBe(true);
    expect(isDayOff(optional)).toBe(false);
    expect(isDayOff(createHoliday(DIWALI))).toBe(true);
  });

  it("needs a name of at most 80 characters and a real date", () => {
    expect(codeOf(() => createHoliday({ ...DIWALI, name: "" }))).toEqual({
      code: "HOLIDAY_NAME_REQUIRED",
      field: "name",
    });
    expect(
      createHoliday({ ...DIWALI, name: "x".repeat(80) }).name,
    ).toHaveLength(80);
    expect(
      codeOf(() => createHoliday({ ...DIWALI, name: "x".repeat(81) })),
    ).toEqual({ code: "HOLIDAY_NAME_TOO_LONG", field: "name" });
    expect(
      codeOf(() => createHoliday({ ...DIWALI, date: "2026-02-30" })),
    ).toEqual({ code: "HOLIDAY_DATE_INVALID", field: "date" });
    expect(
      codeOf(() => createHoliday({ ...DIWALI, date: "1999-01-26" })),
    ).toEqual({ code: "HOLIDAY_DATE_INVALID", field: "date" });
    expect(
      codeOf(() => createHoliday({ ...DIWALI, description: "x".repeat(501) })),
    ).toEqual({ code: "HOLIDAY_DESCRIPTION_TOO_LONG", field: "description" });
  });
});

describe("one holiday per date", () => {
  it("is a 409 naming the date field", () => {
    const error = holidayDateTaken("2026-01-26", "Republic Day");
    expect(error.kind).toBe("conflict");
    expect(error.code).toBe("HOLIDAY_DATE_TAKEN");
    expect(error.details).toEqual({ field: "date", date: "2026-01-26" });
  });

  it("finds dates repeated in a sheet", () => {
    expect([
      ...repeatedDates([
        "2026-01-26",
        "2026-08-15",
        "2026-01-26",
        "2026-01-26",
      ]),
    ]).toEqual(["2026-01-26"]);
    expect(repeatedDates(["2026-01-26"]).size).toBe(0);
  });
});

describe("holidayTypeFromLabel", () => {
  it("reads the sheet's labels in any case", () => {
    expect(holidayTypeFromLabel(" National ")).toBe("national");
    expect(holidayTypeFromLabel("FESTIVAL")).toBe("festival");
    expect(holidayTypeFromLabel("Restricted")).toBeNull();
  });
});
