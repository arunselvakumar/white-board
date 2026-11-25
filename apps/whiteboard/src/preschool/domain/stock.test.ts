import { describe, expect, it } from "vitest";

import { PreschoolError } from "./errors";
import { assertEnoughStock, isLowStock, quantityDelta } from "./stock";

describe("stock", () => {
  it("adds on receipt and transfer in, takes on issue and transfer out", () => {
    expect(quantityDelta("received", 40)).toBe(40);
    expect(quantityDelta("transfer_in", 5)).toBe(5);
    expect(quantityDelta("issued_to_child", 2)).toBe(-2);
    expect(quantityDelta("transfer_out", 5)).toBe(-5);
  });

  it("takes an adjustment as typed, either way", () => {
    expect(quantityDelta("adjusted", -3)).toBe(-3);
    expect(quantityDelta("adjusted", 2)).toBe(2);
  });

  it("refuses zero, fractions, and a negative count on anything but an adjustment", () => {
    expect(() => quantityDelta("received", 0)).toThrow(PreschoolError);
    expect(() => quantityDelta("received", 1.5)).toThrow(PreschoolError);
    expect(() => quantityDelta("issued_to_staff", -1)).toThrow(PreschoolError);
  });

  it("never lets stock on hand go below zero", () => {
    const item = { name: "Nursery kit", unit: "set" };
    expect(() => {
      assertEnoughStock(3, -3, item);
    }).not.toThrow();
    expect(() => {
      assertEnoughStock(3, -4, item);
    }).toThrow("Only 3 set of Nursery kit in stock at this Centre.");
  });

  it("is low at or below the reorder level, never without one", () => {
    expect(isLowStock(5, 5)).toBe(true);
    expect(isLowStock(6, 5)).toBe(false);
    expect(isLowStock(0, null)).toBe(false);
  });
});
