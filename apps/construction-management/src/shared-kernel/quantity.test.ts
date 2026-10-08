import { describe, expect, it } from "vitest";

import { Quantity } from "./quantity";

describe("Quantity", () => {
  it("keeps three decimals exactly", () => {
    const total = Quantity.of("0.1", "cum").add(Quantity.of("0.2", "cum"));
    expect(total.toDecimalString()).toBe("0.300");
    expect(Quantity.of(12.5, "bag").toDecimalString()).toBe("12.500");
    expect(() => Quantity.of("1.2345", "kg")).toThrow(RangeError);
  });

  it("never combines two units", () => {
    expect(() => Quantity.of(1, "sqft").add(Quantity.of(1, "sqm"))).toThrow(
      RangeError,
    );
  });
});
