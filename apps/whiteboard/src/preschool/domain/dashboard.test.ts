import { describe, expect, it } from "vitest";

import {
  dailyReportCounts,
  isMonth,
  isOpenEnquiry,
  monthSpan,
  occupancyPercent,
} from "./dashboard";

describe("months", () => {
  it("accepts YYYY-MM only", () => {
    expect(isMonth("2026-11")).toBe(true);
    expect(isMonth("2026-13")).toBe(false);
    expect(isMonth("2026-1")).toBe(false);
  });

  it("spans a month, February included", () => {
    expect(monthSpan("2026-11")).toEqual({
      startsOn: "2026-11-01",
      endsOn: "2026-11-30",
    });
    expect(monthSpan("2028-02").endsOn).toBe("2028-02-29");
  });
});

describe("occupancyPercent", () => {
  it("rounds to a whole per cent and is 0 without seats", () => {
    expect(occupancyPercent(17, 20)).toBe(85);
    expect(occupancyPercent(2, 3)).toBe(67);
    expect(occupancyPercent(5, 0)).toBe(0);
  });
});

describe("isOpenEnquiry", () => {
  it("is open until admitted or lost", () => {
    expect(isOpenEnquiry("visit_scheduled")).toBe(true);
    expect(isOpenEnquiry("admitted")).toBe(false);
    expect(isOpenEnquiry("lost")).toBe(false);
  });
});

describe("dailyReportCounts", () => {
  it("counts reports over the Children present", () => {
    expect(
      dailyReportCounts(
        ["a", "b", "c"],
        new Map([
          ["a", "published"],
          ["b", "draft"],
          ["z", "published"],
        ]),
      ),
    ).toEqual({ published: 1, draft: 1, notStarted: 1 });
  });
});
