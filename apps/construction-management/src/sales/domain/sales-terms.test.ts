import { describe, expect, it } from "vitest";

import { normaliseMobile } from "./sales-terms";

describe("normaliseMobile (CM-0022 §3)", () => {
  it.each([
    ["98765 43210", "+919876543210"],
    ["098765-43210", "+919876543210"],
    ["+91 98765 43210", "+919876543210"],
    ["919876543210", "+919876543210"],
    ["+44 20 7946 0958", "+442079460958"],
  ])("%s → %s", (raw, expected) => {
    expect(normaliseMobile(raw)).toBe(expected);
  });

  it.each(["12345", "abc", "5876543210", "+12"])("refuses %s", (raw) => {
    expect(normaliseMobile(raw)).toBeNull();
  });
});
