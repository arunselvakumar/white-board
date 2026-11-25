import { describe, expect, it } from "vitest";

import { ageRangeLabel } from "./preschool-age-range";

describe("ageRangeLabel", () => {
  it("shows ages in years and months", () => {
    expect(ageRangeLabel(36, 47)).toBe("3 y – 3 y 11 m");
    expect(ageRangeLabel(18, 35)).toBe("1 y 6 m – 2 y 11 m");
  });

  it("names an open end and no limit", () => {
    expect(ageRangeLabel(36, null)).toBe("From 3 y");
    expect(ageRangeLabel(null, 18)).toBe("Up to 1 y 6 m");
    expect(ageRangeLabel(null, null)).toBe("No age limit");
  });
});
