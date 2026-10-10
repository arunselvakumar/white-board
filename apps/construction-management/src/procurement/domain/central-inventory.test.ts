import { describe, expect, it } from "vitest";

import { stockLedgerLine, stockState } from "./central-inventory";

describe("Central Inventory (CM-509)", () => {
  it("reads Out of stock at zero and Low stock at or below the minimum", () => {
    expect(stockState("0", "5")).toBe("out_of_stock");
    expect(stockState("5", "5")).toBe("low_stock");
    expect(stockState("5.001", "5")).toBe("in_stock");
    expect(stockState("1", null)).toBe("in_stock");
  });

  it("closes as opening plus every movement", () => {
    const line = stockLedgerLine(
      "10",
      new Map([
        ["received", "5"],
        ["issued", "-8"],
      ]),
    );
    expect(line.opening).toBe("10.000");
    expect(line.movements.issued).toBe("-8.000");
    expect(line.movements.consumed).toBe("0.000");
    expect(line.closing).toBe("7.000");
  });
});
