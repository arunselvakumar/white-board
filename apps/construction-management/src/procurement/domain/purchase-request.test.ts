import { describe, expect, it } from "vitest";

import {
  assertCanMarkOrdered,
  assertPurchaseRequestDeletable,
  assertPurchaseRequestEditable,
  assertRequiredDate,
  balancedEstimatedQty,
  lineQuantity,
  orderStatusOf,
  pendingQuantity,
  purchaseRequestLines,
  type LineMaterial,
} from "./purchase-request";

const CEMENT: LineMaterial = {
  id: "0199c4a0-0000-7000-8000-00000000a001",
  name: "Cement OPC 53 Grade",
  uomId: "0199c4a0-0000-7000-8000-00000000b001",
  uomName: "Bag",
  categoryId: null,
  disabled: false,
};
const SAND: LineMaterial = {
  ...CEMENT,
  id: "0199c4a0-0000-7000-8000-00000000a003",
  name: "M Sand",
  uomName: "cum",
};
const materials = new Map([CEMENT, SAND].map((m) => [m.id, m]));

function code(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

describe("purchase request lines", () => {
  it("copies the material and keeps remarks only when separate", () => {
    const lines = purchaseRequestLines(
      [
        { materialId: CEMENT.id, quantity: "100", remark: "  for slab " },
        { materialId: SAND.id, quantity: "2.5" },
      ],
      materials,
      true,
    );
    expect(lines.map((line) => [line.materialName, line.quantity])).toEqual([
      ["Cement OPC 53 Grade", "100.000"],
      ["M Sand", "2.500"],
    ]);
    expect(lines[0]?.remark).toBe("for slab");
    expect(
      purchaseRequestLines(
        [{ materialId: CEMENT.id, quantity: "1", remark: "x" }],
        materials,
        false,
      )[0]?.remark,
    ).toBeNull();
  });

  it("refuses no lines, repeats, unknown or disabled materials and bad quantities", () => {
    expect(
      code(() => {
        purchaseRequestLines([], materials, false);
      }),
    ).toBe("ITEMS_REQUIRED");
    expect(
      code(() =>
        purchaseRequestLines(
          [
            { materialId: CEMENT.id, quantity: "1" },
            { materialId: CEMENT.id, quantity: "2" },
          ],
          materials,
          false,
        ),
      ),
    ).toBe("MATERIAL_REPEATED");
    expect(
      code(() =>
        purchaseRequestLines(
          [
            {
              materialId: "0199c4a0-0000-7000-8000-0000000000ff",
              quantity: "1",
            },
          ],
          materials,
          false,
        ),
      ),
    ).toBe("MATERIAL_NOT_FOUND");
    expect(
      code(() =>
        purchaseRequestLines(
          [{ materialId: CEMENT.id, quantity: "1" }],
          new Map([[CEMENT.id, { ...CEMENT, disabled: true }]]),
          false,
        ),
      ),
    ).toBe("MATERIAL_NOT_FOUND");
    for (const bad of ["0", "-1", "1.2345", "abc", "100000000000"])
      expect(
        code(() => {
          lineQuantity(bad, 0);
        }),
      ).toBe("QUANTITY_INVALID");
  });

  it("needs the Required Date on or after the request date", () => {
    expect(() => {
      assertRequiredDate("2026-10-10", "2026-10-10");
    }).not.toThrow();
    expect(
      code(() => {
        assertRequiredDate("2026-10-10", "2026-10-09");
      }),
    ).toBe("REQUIRED_DATE_BEFORE_REQUEST_DATE");
  });
});

describe("purchase request states", () => {
  const state = (
    approvalStatus: "pending" | "approved" | "rejected",
    orderStatus:
      | "not_ordered"
      | "partially_ordered"
      | "ordered"
      | "excess_ordered" = "not_ordered",
    marked = false,
  ) => ({
    approvalStatus,
    orderStatus,
    markedOrderedAt: marked ? new Date() : null,
  });

  it("edits only pending or rejected requests", () => {
    expect(() => {
      assertPurchaseRequestEditable(state("pending"));
    }).not.toThrow();
    expect(() => {
      assertPurchaseRequestEditable(state("rejected"));
    }).not.toThrow();
    expect(
      code(() => {
        assertPurchaseRequestEditable(state("approved"));
      }),
    ).toBe("PURCHASE_REQUEST_NOT_EDITABLE");
  });

  it("marks as ordered from approved or partially ordered only", () => {
    expect(() => {
      assertCanMarkOrdered(state("approved"));
    }).not.toThrow();
    expect(() => {
      assertCanMarkOrdered(state("approved", "partially_ordered"));
    }).not.toThrow();
    for (const refused of [
      state("pending"),
      state("rejected"),
      state("approved", "ordered"),
      state("approved", "excess_ordered"),
      state("approved", "not_ordered", true),
    ])
      expect(
        code(() => {
          assertCanMarkOrdered(refused);
        }),
      ).toBe("PURCHASE_REQUEST_NOT_ORDERABLE");
  });

  it("refuses deleting a request with order lines", () => {
    expect(() => {
      assertPurchaseRequestDeletable(0);
    }).not.toThrow();
    expect(
      code(() => {
        assertPurchaseRequestDeletable(1);
      }),
    ).toBe("PURCHASE_REQUEST_HAS_ORDERS");
  });

  it("derives the order status from the items", () => {
    const item = (quantity: string, orderedQty: string) => ({
      quantity,
      orderedQty,
    });
    expect(orderStatusOf([item("10", "0"), item("5", "0")], false)).toBe(
      "not_ordered",
    );
    expect(orderStatusOf([item("10", "4"), item("5", "0")], false)).toBe(
      "partially_ordered",
    );
    expect(orderStatusOf([item("10", "10"), item("5", "5.000")], false)).toBe(
      "ordered",
    );
    expect(orderStatusOf([item("10", "12"), item("5", "0")], false)).toBe(
      "excess_ordered",
    );
    expect(orderStatusOf([item("10", "0")], true)).toBe("ordered");
  });

  it("computes pending and balanced estimated quantities", () => {
    expect(pendingQuantity("10", "4")).toBe("6.000");
    expect(pendingQuantity("10", "12")).toBe("0.000");
    expect(balancedEstimatedQty("1000", "250.5", "100")).toBe("649.500");
    expect(balancedEstimatedQty("100", "80", "40")).toBe("-20.000");
    expect(balancedEstimatedQty(null, "80", "40")).toBeNull();
  });
});
