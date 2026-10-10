import { describe, expect, it } from "vitest";

import { planInventoryImport } from "./inventory-import";

const CEMENT = { id: "m-cement", name: "Cement OPC 53", uomName: "Bag" };
const STEEL = { id: "m-steel", name: "TMT Steel 12 mm", uomName: "kg" };
const MATERIALS = new Map([
  ["cement opc 53", CEMENT],
  ["tmt steel 12 mm", STEEL],
]);

describe("planInventoryImport (CM-506)", () => {
  it("matches names ignoring case and plans opening stock and estimates", () => {
    const plan = planInventoryImport(
      [
        {
          row: 2,
          cells: {
            material: " cement OPC 53 ",
            quantity: 120,
            unit: "bag",
            estimatedQty: "500",
          },
        },
        {
          row: 3,
          cells: {
            material: "TMT Steel 12 mm",
            quantity: null,
            estimatedQty: 2000,
          },
        },
      ],
      MATERIALS,
      new Set(["m-steel"]),
    );
    expect(plan.errorCount).toBe(0);
    expect(plan.rows).toEqual([
      expect.objectContaining({
        row: 2,
        materialId: "m-cement",
        quantity: "120.000",
        estimatedQty: "500.000",
        errors: [],
      }),
      expect.objectContaining({
        row: 3,
        materialId: "m-steel",
        quantity: null,
        estimatedQty: "2000.000",
        errors: [],
      }),
    ]);
  });

  it("reports unknown materials, wrong units, repeats and existing stock per row", () => {
    const plan = planInventoryImport(
      [
        { row: 2, cells: { material: "Granite", quantity: 1 } },
        {
          row: 3,
          cells: { material: "Cement OPC 53", quantity: 1, unit: "kg" },
        },
        { row: 4, cells: { material: "TMT Steel 12 mm", quantity: 5 } },
        { row: 5, cells: { material: "Cement OPC 53", quantity: "1.2345" } },
        { row: 6, cells: { material: "", quantity: 2 } },
      ],
      MATERIALS,
      new Set(["m-steel"]),
    );
    const codes = plan.rows.map((row) => row.errors.map((error) => error.code));
    expect(codes).toEqual([
      ["MATERIAL_NOT_FOUND"],
      ["UNIT_MISMATCH"],
      ["MATERIAL_HAS_STOCK_MOVEMENTS"],
      ["QUANTITY_INVALID", "MATERIAL_REPEATED"],
      ["MATERIAL_REQUIRED"],
    ]);
    expect(plan.errorCount).toBe(5);
  });

  it("asks for a quantity or an estimate on a row with neither", () => {
    const plan = planInventoryImport(
      [{ row: 2, cells: { material: "Cement OPC 53", quantity: 0 } }],
      MATERIALS,
      new Set(),
    );
    expect(plan.rows[0]?.errors.map((error) => error.code)).toEqual([
      "IMPORT_ROW_EMPTY",
    ]);
  });

  it("refuses an empty sheet", () => {
    expect(() => planInventoryImport([], MATERIALS, new Set())).toThrow(
      expect.objectContaining({ code: "IMPORT_EMPTY" }),
    );
  });
});
