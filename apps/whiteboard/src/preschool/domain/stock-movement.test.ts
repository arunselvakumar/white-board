import { describe, expect, it } from "vitest";

import {
  assertStockLines,
  runningBalances,
  stockMovedOn,
} from "./stock-movement";

describe("stock movements", () => {
  it("dates a movement today unless told, never in the future", () => {
    expect(stockMovedOn(undefined, "2026-11-25")).toBe("2026-11-25");
    expect(stockMovedOn("2026-11-01", "2026-11-25")).toBe("2026-11-01");
    expect(() => stockMovedOn("2026-11-26", "2026-11-25")).toThrow(
      expect.objectContaining({ code: "STOCK_DATE_IN_FUTURE" }),
    );
  });

  it("lists each item once", () => {
    expect(() => {
      assertStockLines([{ itemId: "a" }, { itemId: "b" }]);
    }).not.toThrow();
    expect(() => {
      assertStockLines([{ itemId: "a" }, { itemId: "a" }]);
    }).toThrow(expect.objectContaining({ code: "STOCK_DUPLICATE_ITEM" }));
    expect(() => {
      assertStockLines([]);
    }).toThrow(expect.objectContaining({ code: "STOCK_LINES_REQUIRED" }));
  });

  it("keeps a running balance, oldest first", () => {
    expect(
      runningBalances([
        { id: "a", quantityDelta: 40 },
        { id: "b", quantityDelta: -3 },
        { id: "c", quantityDelta: -10 },
      ]),
    ).toEqual(
      new Map([
        ["a", 40],
        ["b", 37],
        ["c", 27],
      ]),
    );
  });
});
