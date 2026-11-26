import { describe, expect, it } from "vitest";

import { academicYearFor, nextAcademicYear } from "./academic-year";
import { ageInMonths, formatAge, timeInIndia, todayInIndia } from "./dates";

describe("academicYearFor", () => {
  it("puts a date after the start month in the year that began that calendar year", () => {
    expect(academicYearFor("2026-11-25", 4)).toEqual({
      name: "2026–27",
      startsOn: "2026-04-01",
      endsOn: "2027-03-31",
    });
  });

  it("puts a date before the start month in the year that began the calendar year before", () => {
    expect(academicYearFor("2027-02-10", 6)).toEqual({
      name: "2026–27",
      startsOn: "2026-06-01",
      endsOn: "2027-05-31",
    });
  });

  it("names a January year by one calendar year", () => {
    expect(academicYearFor("2026-07-01", 1).name).toBe("2026");
  });

  it("gives the following year", () => {
    expect(nextAcademicYear("2026-04-01", 4).name).toBe("2027–28");
  });
});

describe("dates", () => {
  it("reads today in India, which is ahead of UTC", () => {
    expect(todayInIndia(new Date("2026-11-25T19:00:00Z"))).toBe("2026-11-26");
    expect(timeInIndia(new Date("2026-11-25T03:45:00Z"))).toBe("09:15");
  });

  it("counts completed months of age", () => {
    expect(ageInMonths("2023-06-15", "2026-06-14")).toBe(35);
    expect(ageInMonths("2023-06-15", "2026-06-15")).toBe(36);
    expect(formatAge(40)).toBe("3 y 4 m");
    expect(formatAge(36)).toBe("3 y");
    expect(formatAge(7)).toBe("7 m");
  });
});
