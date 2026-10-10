import { describe, expect, it } from "vitest";

import {
  adjustmentDifference,
  assertMovementDate,
  isEditableMovement,
  movementBackdatedModule,
  movementQuantity,
  nonNegativeQuantity,
} from "./stock-movement";

describe("stock movements (CM-506)", () => {
  it("takes quantities above zero with at most 3 decimals", () => {
    expect(movementQuantity("12.5")).toBe("12.500");
    expect(() => movementQuantity("0")).toThrow(
      expect.objectContaining({ code: "QUANTITY_INVALID" }),
    );
    expect(() => movementQuantity("1.2345")).toThrow(
      expect.objectContaining({ code: "QUANTITY_INVALID" }),
    );
    expect(() => movementQuantity("abc")).toThrow(
      expect.objectContaining({ code: "QUANTITY_INVALID" }),
    );
    expect(() => movementQuantity("100000000000")).toThrow(
      expect.objectContaining({ code: "QUANTITY_TOO_LARGE" }),
    );
    expect(nonNegativeQuantity("0", "estimatedQty")).toBe("0.000");
    expect(() => nonNegativeQuantity("-1", "estimatedQty")).toThrow(
      expect.objectContaining({ code: "QUANTITY_INVALID" }),
    );
  });

  it("adjusts by the counted quantity less the stock", () => {
    expect(adjustmentDifference("95", "100.000")).toBe("-5.000");
    expect(adjustmentDifference("102.5", "100")).toBe("2.500");
    expect(adjustmentDifference("0", "3")).toBe("-3.000");
    expect(() => adjustmentDifference("100", "100.000")).toThrow(
      expect.objectContaining({ code: "ADJUSTMENT_NO_CHANGE" }),
    );
  });

  it("checks each kind against its back-dated module", () => {
    expect(movementBackdatedModule("consumed")).toBe("material_consumed");
    expect(movementBackdatedModule("missing")).toBe("missing_material");
    expect(movementBackdatedModule("adjustment")).toBe("current_inventory");
    expect(movementBackdatedModule("opening")).toBe("current_inventory");
  });

  it("edits all but adjustments and refuses future dates", () => {
    expect(isEditableMovement("consumed")).toBe(true);
    expect(isEditableMovement("adjustment")).toBe(false);
    expect(() => {
      assertMovementDate("2026-10-11", "2026-10-10");
    }).toThrow(
      expect.objectContaining({ code: "STOCK_MOVEMENT_DATE_IN_FUTURE" }),
    );
    expect(() => {
      assertMovementDate("2026-10-10", "2026-10-10");
    }).not.toThrow();
  });
});
