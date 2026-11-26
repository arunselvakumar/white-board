import { describe, expect, it } from "vitest";

import { stockItemFields } from "./stock-item";

const base = {
  name: "  Nursery  kit ",
  category: "kit" as const,
  kind: "consumable" as const,
  unit: " Set ",
  reorderLevel: 10,
};

describe("stockItemFields", () => {
  it("trims the name and lower-cases the unit", () => {
    expect(stockItemFields(base)).toEqual({
      ...base,
      name: "Nursery kit",
      unit: "set",
    });
  });

  it("refuses an empty name or unit and a negative reorder level", () => {
    expect(() => stockItemFields({ ...base, name: " " })).toThrow(
      expect.objectContaining({ code: "STOCK_ITEM_NAME_REQUIRED" }),
    );
    expect(() => stockItemFields({ ...base, unit: "" })).toThrow(
      expect.objectContaining({ code: "STOCK_ITEM_UNIT_INVALID" }),
    );
    expect(() => stockItemFields({ ...base, reorderLevel: -1 })).toThrow(
      expect.objectContaining({ code: "STOCK_REORDER_LEVEL_INVALID" }),
    );
    expect(stockItemFields({ ...base, reorderLevel: null }).reorderLevel).toBe(
      null,
    );
  });
});
