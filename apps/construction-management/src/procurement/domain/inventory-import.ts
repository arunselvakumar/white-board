import { DomainError } from "@/src/shared-kernel/domain-error";
import { Quantity } from "@/src/shared-kernel/quantity";

import { nonNegativeQuantity } from "./stock-movement";

/**
 * Import Inventory Stock (CM-506, ADR CM-0015 §5): rows of the sample sheet
 * (Material, Quantity, Unit, Estimated Qty). A row matches a Material by
 * name ignoring case, its unit (when given) must be the Material's, and a
 * quantity posts **Opening** stock only for a material with no entries at
 * the location yet. Estimated Qty is set either way. The import is all or
 * nothing: any row with an error and nothing is posted.
 */

export const INVENTORY_IMPORT_COLUMNS = [
  { key: "material", header: "Material", width: 36 },
  { key: "quantity", header: "Quantity", width: 14 },
  { key: "unit", header: "Unit", width: 12 },
  { key: "estimatedQty", header: "Estimated Qty", width: 16 },
] as const;
export type InventoryImportColumnKey =
  (typeof INVENTORY_IMPORT_COLUMNS)[number]["key"];

export const MAX_INVENTORY_IMPORT_ROWS = 1000;

export type InventoryImportCell = string | number | Date | null;

export type InventorySheetRow = {
  /** The row number in the sheet (the header is row 1). */
  row: number;
  cells: Partial<Record<InventoryImportColumnKey, InventoryImportCell>>;
};

export type ImportMaterial = { id: string; name: string; uomName: string };

export type InventoryImportRowResult = {
  row: number;
  /** As written in the sheet. */
  material: string;
  materialId: string | null;
  /** Opening stock to post, or null. */
  quantity: string | null;
  estimatedQty: string | null;
  errors: { code: string; message: string }[];
};

export type InventoryImportPlan = {
  rows: InventoryImportRowResult[];
  /** Rows with at least one error. */
  errorCount: number;
};

function text(cell: InventoryImportCell | undefined): string {
  if (cell == null) return "";
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  return String(cell).trim();
}

function quantityCell(
  cell: InventoryImportCell | undefined,
  label: string,
  errors: InventoryImportRowResult["errors"],
): string | null {
  const raw = text(cell);
  if (raw === "") return null;
  try {
    return nonNegativeQuantity(raw.replace(/,/g, ""), label);
  } catch (error) {
    errors.push({
      code: error instanceof DomainError ? error.code : "QUANTITY_INVALID",
      message: `${label}: enter 0 or more with at most 3 decimal places.`,
    });
    return null;
  }
}

/**
 * Checks every row. `materials` maps lower-cased names to live Materials;
 * `hasEntries` holds Materials that already have stock entries here.
 */
export function planInventoryImport(
  sheet: readonly InventorySheetRow[],
  materials: ReadonlyMap<string, ImportMaterial>,
  hasEntries: ReadonlySet<string>,
): InventoryImportPlan {
  if (sheet.length === 0)
    throw new DomainError(
      "IMPORT_EMPTY",
      "The sheet has no rows. Fill in the sample sheet and upload it again.",
    );
  if (sheet.length > MAX_INVENTORY_IMPORT_ROWS)
    throw new DomainError(
      "IMPORT_TOO_MANY_ROWS",
      `Import at most ${String(MAX_INVENTORY_IMPORT_ROWS)} rows at a time.`,
    );
  const seen = new Map<string, number>();
  const rows = sheet.map((line): InventoryImportRowResult => {
    const errors: InventoryImportRowResult["errors"] = [];
    const name = text(line.cells.material);
    const quantity = quantityCell(line.cells.quantity, "Quantity", errors);
    const estimatedQty = quantityCell(
      line.cells.estimatedQty,
      "Estimated Qty",
      errors,
    );
    const material =
      name === "" ? undefined : materials.get(name.toLowerCase());
    if (name === "")
      errors.push({
        code: "MATERIAL_REQUIRED",
        message: "Write the material.",
      });
    else if (material == null)
      errors.push({
        code: "MATERIAL_NOT_FOUND",
        message: `No material named “${name}” in Masters.`,
      });
    else {
      const earlier = seen.get(material.id);
      if (earlier != null)
        errors.push({
          code: "MATERIAL_REPEATED",
          message: `This material is already on row ${String(earlier)}.`,
        });
      else seen.set(material.id, line.row);
      const unit = text(line.cells.unit);
      if (unit !== "" && unit.toLowerCase() !== material.uomName.toLowerCase())
        errors.push({
          code: "UNIT_MISMATCH",
          message: `${material.name} is kept in ${material.uomName}, not ${unit}.`,
        });
    }
    const opening =
      quantity != null && !Quantity.of(quantity, "unit").isZero()
        ? quantity
        : null;
    if (opening != null && material != null && hasEntries.has(material.id))
      errors.push({
        code: "MATERIAL_HAS_STOCK_MOVEMENTS",
        message: "Already has stock movements here; use Adjust stock.",
      });
    if (errors.length === 0 && opening == null && estimatedQty == null)
      errors.push({
        code: "IMPORT_ROW_EMPTY",
        message: "Write a Quantity or an Estimated Qty.",
      });
    return {
      row: line.row,
      material: name,
      materialId: material?.id ?? null,
      quantity: opening,
      estimatedQty,
      errors,
    };
  });
  return {
    rows,
    errorCount: rows.filter((row) => row.errors.length > 0).length,
  };
}
