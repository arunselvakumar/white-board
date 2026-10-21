import { describe, expect, it } from "vitest";

import {
  isHoldExpired,
  parseArea,
  unavailableFields,
  unitProfileFields,
  unitSalesStatus,
} from "./unit-profile";

describe("parseArea (CM-0022 §8)", () => {
  it.each([
    ["1250", "1250"],
    ["1,250.50", "1250.5"],
    [" 980.25 ", "980.25"],
    [1250.5, "1250.5"],
    ["0.5", "0.5"],
  ])("%s → %s", (raw, expected) => {
    expect(parseArea(raw, "carpetArea")).toBe(expected);
  });

  it("leaves a blank area out", () => {
    expect(parseArea("", "carpetArea")).toBeNull();
    expect(parseArea(null, "carpetArea")).toBeNull();
  });

  it.each(["0", "-5", "12.345", "abc", 12.345, 0])("refuses %s", (raw) => {
    expect(() => parseArea(raw, "carpetArea")).toThrow(
      expect.objectContaining({ code: "AREA_INVALID" }),
    );
  });
});

describe("unitProfileFields", () => {
  it("defaults the area unit to sq ft and trims the Unit type", () => {
    expect(
      unitProfileFields({ unitType: "  2BHK ", carpetArea: "820" }),
    ).toEqual({
      unitType: "2BHK",
      carpetArea: "820",
      builtUpArea: null,
      superBuiltUpArea: null,
      areaUnit: "sq_ft",
    });
  });

  it("refuses a long Unit type and an unknown area unit", () => {
    expect(() => unitProfileFields({ unitType: "x".repeat(61) })).toThrow(
      expect.objectContaining({ code: "UNIT_TYPE_TOO_LONG" }),
    );
    expect(() => unitProfileFields({ areaUnit: "acre" })).toThrow(
      expect.objectContaining({ code: "AREA_UNIT_INVALID" }),
    );
  });
});

describe("unavailableFields", () => {
  it("needs one of the four reasons", () => {
    expect(unavailableFields({ reason: "reserved", note: " for MD " })).toEqual(
      { reason: "reserved", note: "for MD" },
    );
    expect(() => unavailableFields({ reason: "sold" })).toThrow(
      expect.objectContaining({ code: "UNAVAILABLE_REASON_INVALID" }),
    );
  });
});

describe("unitSalesStatus (CM-0022 §7, §8)", () => {
  const today = "2026-10-17";
  it("is Unavailable before anything else", () => {
    expect(
      unitSalesStatus(
        { unavailable: true },
        { status: "booked", holdUntil: null },
        today,
      ),
    ).toBe("unavailable");
  });

  it("follows the active booking; a hold past its date counts Available", () => {
    expect(unitSalesStatus(null, null, today)).toBe("available");
    expect(
      unitSalesStatus(null, { status: "booked", holdUntil: null }, today),
    ).toBe("booked");
    expect(
      unitSalesStatus(null, { status: "on_hold", holdUntil: today }, today),
    ).toBe("on_hold");
    expect(
      unitSalesStatus(
        null,
        { status: "on_hold", holdUntil: "2026-10-16" },
        today,
      ),
    ).toBe("available");
    expect(isHoldExpired({ status: "on_hold", holdUntil: null }, today)).toBe(
      false,
    );
  });
});
