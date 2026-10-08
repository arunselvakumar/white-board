import { describe, expect, it } from "vitest";

import { Money, formatMinor } from "./money";

describe("Money", () => {
  it("is whole paise", () => {
    expect(() => Money.ofMinor(10.5)).toThrow(RangeError);
    expect(Money.ofMajor("1234.56").minor).toBe(123456);
  });

  it("rounds rupees half up to the paisa", () => {
    expect(Money.ofMajor("0.005").minor).toBe(1);
    expect(Money.ofMajor("0.004").minor).toBe(0);
    expect(Money.ofMajor("-0.005").minor).toBe(-1);
    expect(Money.ofMajor(1.005).minor).toBe(101);
  });

  it("multiplies by exact decimals, rounding half away from zero", () => {
    // 18% GST on ₹1,234.50 is ₹222.21.
    expect(Money.ofMinor(123450).multiply("0.18").minor).toBe(22221);
    // 12.5 cubic metres at ₹4,999.99 is ₹62,499.875 → ₹62,499.88.
    expect(Money.ofMinor(499999).multiply("12.5").minor).toBe(6249988);
    // A float factor that is inexact in binary still rounds correctly.
    expect(Money.ofMinor(100).multiply(1.005).minor).toBe(101);
    expect(Money.ofMinor(-250).multiply("0.5").minor).toBe(-125);
  });

  it("adds and subtracts in one currency only", () => {
    const a = Money.ofMinor(1000);
    expect(a.add(Money.ofMinor(250)).minor).toBe(1250);
    expect(a.subtract(Money.ofMinor(1250)).minor).toBe(-250);
    expect(() => a.add(Money.ofMinor(1, "USD"))).toThrow(RangeError);
  });

  it("formats INR with Indian grouping", () => {
    expect(Money.ofMinor(10000000).format()).toBe("₹1,00,000.00");
    expect(Money.ofMajor("12345678.9").format()).toBe("₹1,23,45,678.90");
    expect(Money.zero().format()).toBe("₹0.00");
    expect(formatMinor(-150050)).toBe("-₹1,500.50");
  });
});
