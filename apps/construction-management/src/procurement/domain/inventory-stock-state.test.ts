import { describe, expect, it } from "vitest";

import {
  belowAlertingMinimum,
  effectiveMinimum,
  stockState,
} from "./inventory-stock-state";

describe("stockState (ADR CM-0015 §10)", () => {
  it("is Out of stock at zero or below, whatever the minimum", () => {
    expect(stockState("0.000", null)).toBe("out_of_stock");
    expect(stockState("0", "10")).toBe("out_of_stock");
    expect(stockState("-1.5", "0")).toBe("out_of_stock");
  });

  it("is Low stock at or below a minimum above zero", () => {
    expect(stockState("10.000", "10")).toBe("low_stock");
    expect(stockState("9.999", "10.000")).toBe("low_stock");
    expect(stockState("10.001", "10")).toBe("in_stock");
  });

  it("is In stock with no minimum or a zero minimum", () => {
    expect(stockState("1", null)).toBe("in_stock");
    expect(stockState("1", "0.000")).toBe("in_stock");
  });

  it("prefers the location's override over the Material's minimum", () => {
    expect(effectiveMinimum("5.000", "50.000")).toBe("5.000");
    expect(effectiveMinimum("0.000", "50.000")).toBe("0.000");
    expect(effectiveMinimum(null, "50.000")).toBe("50.000");
    expect(effectiveMinimum(null, null)).toBeNull();
  });

  it("alerts only with the toggle on and a minimum above zero", () => {
    expect(belowAlertingMinimum("10", "10", true)).toBe(true);
    expect(belowAlertingMinimum("0", "10", true)).toBe(true);
    expect(belowAlertingMinimum("10", "10", false)).toBe(false);
    expect(belowAlertingMinimum("0", "0", true)).toBe(false);
    expect(belowAlertingMinimum("0", null, true)).toBe(false);
    expect(belowAlertingMinimum("11", "10", true)).toBe(false);
  });
});
