import {
  formatMobile,
  isValidMobile,
  normalizeMobile,
} from "@repo/auth/construction/mobile";
import { describe, expect, it } from "vitest";

describe("mobile numbers (ADR CM-0002)", () => {
  it("normalises the ways people type an Indian mobile", () => {
    for (const typed of [
      "98765 43210",
      "+91 98765 43210",
      "+91-98765-43210",
      "09876543210",
      "919876543210",
    ])
      expect(normalizeMobile(typed)).toBe("+919876543210");
  });

  it("rejects numbers that are not Indian mobiles", () => {
    expect(normalizeMobile("12345 67890")).toBeNull();
    expect(normalizeMobile("+91 2234 5678")).toBeNull();
    expect(isValidMobile("+9198765")).toBe(false);
  });

  it("keeps other countries in E.164", () => {
    expect(normalizeMobile("+971 50 123 4567")).toBe("+971501234567");
  });

  it("formats for screens", () => {
    expect(formatMobile("+919876543210")).toBe("+91 98765 43210");
  });
});
