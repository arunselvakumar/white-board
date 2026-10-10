import { describe, expect, it } from "vitest";

import { datePresetRange } from "./purchase-request-date-presets";

describe("date presets", () => {
  // Saturday 10 October 2026.
  const today = "2026-10-10";
  it("resolves each preset", () => {
    expect(datePresetRange("this_week", today)).toEqual({
      from: "2026-10-05",
      to: today,
    });
    expect(datePresetRange("last_week", today)).toEqual({
      from: "2026-09-28",
      to: "2026-10-04",
    });
    expect(datePresetRange("last_15_days", today)).toEqual({
      from: "2026-09-26",
      to: today,
    });
    expect(datePresetRange("this_month", today)).toEqual({
      from: "2026-10-01",
      to: today,
    });
    expect(datePresetRange("last_month", today)).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(datePresetRange("last_month", "2026-03-31")).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    });
    expect(datePresetRange("custom", today)).toBeNull();
  });
  it("starts a week on Monday, even on a Sunday", () => {
    expect(datePresetRange("this_week", "2026-10-11")).toEqual({
      from: "2026-10-05",
      to: "2026-10-11",
    });
    expect(datePresetRange("this_week", "2026-10-05")).toEqual({
      from: "2026-10-05",
      to: "2026-10-05",
    });
  });
});
