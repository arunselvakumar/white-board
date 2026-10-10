import { describe, expect, it } from "vitest";

import { isLeaveYearKey, leaveYearKey, leaveYearOf } from "./leave-year";

describe("leave year (ADR CM-0012 §6)", () => {
  it("keys a calendar year by the year", () => {
    expect(leaveYearOf("2026-10-10", "calendar")).toEqual({
      key: "2026",
      start: "2026-01-01",
      end: "2026-12-31",
    });
    expect(leaveYearKey("2027-01-01", "calendar")).toBe("2027");
  });

  it("keys a financial year April–March as 26-27", () => {
    expect(leaveYearOf("2026-10-10", "financial")).toEqual({
      key: "26-27",
      start: "2026-04-01",
      end: "2027-03-31",
    });
    expect(leaveYearKey("2027-03-31", "financial")).toBe("26-27");
    expect(leaveYearKey("2027-04-01", "financial")).toBe("27-28");
    expect(leaveYearKey("2000-01-15", "financial")).toBe("99-00");
  });

  it("recognises both shapes of key", () => {
    expect(isLeaveYearKey("2026")).toBe(true);
    expect(isLeaveYearKey("26-27")).toBe(true);
    expect(isLeaveYearKey("2026-27")).toBe(false);
  });
});
