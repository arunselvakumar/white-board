import ExcelJS from "exceljs";

import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  INVENTORY_IMPORT_COLUMNS,
  type InventoryImportCell,
  type InventoryImportColumnKey,
  type InventorySheetRow,
} from "../domain/inventory-import";
import { STOCK_STATE_LABELS } from "../domain/inventory-stock-state";
import {
  STOCK_REGISTER_COLUMNS,
  STOCK_REGISTER_LABELS,
} from "../domain/stock-register";
import type { InventoryRow, StockRegisterRow } from "./inventory-queries";

/**
 * Current Inventory's Excel files (CM-506): the import sample (which
 * Export Sample Excel downloads and Import Inventory Stock reads back),
 * Export Data of the stock list, and the Stock Register. `.xlsx` only.
 */

export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const SHEET = "Inventory";
const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE8EEF7" },
};
const QUANTITY_FORMAT = "#,##0.###";

function addHeader(sheet: ExcelJS.Worksheet, headers: string[]): void {
  const row = sheet.addRow(headers);
  row.font = { bold: true };
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

async function toBytes(
  workbook: ExcelJS.Workbook,
): Promise<Uint8Array<ArrayBuffer>> {
  // A Node Buffer at runtime; exceljs declares its own `Buffer` type.
  const written = (await workbook.xlsx.writeBuffer()) as unknown as Uint8Array;
  return Uint8Array.from(written);
}

function newWorkbook(): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Construction Management";
  return workbook;
}

/** A quantity string as an Excel number. */
function number(value: string | null): number | null {
  return value == null ? null : Number(value);
}

/**
 * Export Sample Excel: the import's columns (Material, Quantity, Unit,
 * Estimated Qty) with the given materials listed so the Store keeper only
 * types quantities. Without materials, two example rows.
 */
export async function inventorySample(
  materials: readonly { name: string; uomName: string }[],
): Promise<Uint8Array<ArrayBuffer>> {
  const workbook = newWorkbook();
  const sheet = workbook.addWorksheet(SHEET);
  INVENTORY_IMPORT_COLUMNS.forEach((column, index) => {
    const target = sheet.getColumn(index + 1);
    target.width = column.width;
    target.numFmt =
      column.key === "material" || column.key === "unit" ? "@" : QUANTITY_FORMAT;
  });
  addHeader(
    sheet,
    INVENTORY_IMPORT_COLUMNS.map((column) => column.header),
  );
  const rows =
    materials.length > 0
      ? materials.map((material) => [material.name, null, material.uomName, null])
      : [
          ["Cement OPC 53 Grade", 120, "Bag", 500],
          ["TMT Steel Bar 12 mm", 1500, "kg", 8000],
        ];
  for (const row of rows) sheet.addRow(row);
  return toBytes(workbook);
}

function cellValue(value: ExcelJS.CellValue): InventoryImportCell {
  if (value == null) return null;
  if (value instanceof Date || typeof value === "number") return value;
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") {
    if ("richText" in value)
      return value.richText.map((part) => part.text).join("");
    if ("result" in value) {
      const result = value.result;
      if (result == null || typeof result === "object")
        return result instanceof Date ? result : null;
      return typeof result === "boolean" ? null : result;
    }
    if ("text" in value) return value.text;
  }
  return null;
}

function headerKey(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const KEYS_BY_HEADER = new Map<string, InventoryImportColumnKey>([
  ...INVENTORY_IMPORT_COLUMNS.map(
    (column) => [headerKey(column.header), column.key] as const,
  ),
  ["materialname", "material"],
  ["qty", "quantity"],
  ["stockqty", "quantity"],
  ["uom", "unit"],
  ["mu", "unit"],
  ["estimatedquantity", "estimatedQty"],
  ["estimationqty", "estimatedQty"],
]);

function fileInvalid(message: string): DomainError {
  return new DomainError("IMPORT_FILE_INVALID", message);
}

/**
 * The data rows of an uploaded sheet (the "Inventory" sheet, or the
 * first): columns found by their header, blank rows skipped. 400
 * `IMPORT_FILE_INVALID` for anything that is not the sample's workbook.
 */
export async function readInventorySheet(
  bytes: Uint8Array,
): Promise<InventorySheetRow[]> {
  // An .xlsx is a zip file: `PK\x03\x04`.
  if (
    bytes.byteLength < 4 ||
    bytes[0] !== 0x50 ||
    bytes[1] !== 0x4b ||
    bytes[2] !== 0x03 ||
    bytes[3] !== 0x04
  )
    throw fileInvalid("Upload the Excel (.xlsx) sample sheet.");
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(Uint8Array.from(bytes).buffer);
  } catch {
    throw fileInvalid("This file could not be read as an Excel workbook.");
  }
  const sheet = workbook.getWorksheet(SHEET) ?? workbook.worksheets[0];
  if (sheet == null) throw fileInvalid("The workbook has no sheets.");

  const columns = new Map<number, InventoryImportColumnKey>();
  sheet.getRow(1).eachCell((cell, column) => {
    const key = KEYS_BY_HEADER.get(
      headerKey(String(cellValue(cell.value) ?? "")),
    );
    if (key != null && ![...columns.values()].includes(key))
      columns.set(column, key);
  });
  const found = new Set(columns.values());
  if (!found.has("material") || !found.has("quantity"))
    throw fileInvalid(
      "The first row must be the sample's headers (Material, Quantity, Unit, Estimated Qty). Download the sample sheet and fill it in.",
    );

  const rows: InventorySheetRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const cells: InventorySheetRow["cells"] = {};
    let blank = true;
    for (const [column, key] of columns) {
      const value = cellValue(row.getCell(column).value);
      const empty =
        value == null || (typeof value === "string" && value.trim() === "");
      if (!empty) blank = false;
      cells[key] = empty ? null : value;
    }
    if (!blank) rows.push({ row: rowNumber, cells });
  });
  return rows;
}

function titleRows(
  sheet: ExcelJS.Worksheet,
  lines: readonly string[],
  width: number,
): void {
  for (const [index, line] of lines.entries()) {
    const row = sheet.addRow([line]);
    if (index === 0) row.font = { bold: true, size: 13 };
    sheet.mergeCells(row.number, 1, row.number, width);
  }
  sheet.addRow([]);
}

function headerRow(sheet: ExcelJS.Worksheet, headers: readonly string[]): void {
  const row = sheet.addRow([...headers]);
  row.font = { bold: true };
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
  });
  sheet.views = [{ state: "frozen", ySplit: row.number }];
}

/** Export Data: the stock list as shown, one row per material. */
export async function inventoryExport(
  locationName: string,
  rows: readonly InventoryRow[],
): Promise<Uint8Array<ArrayBuffer>> {
  const workbook = newWorkbook();
  const sheet = workbook.addWorksheet("Current Inventory");
  const headers = [
    "Material",
    "Category",
    "Unit",
    "Estimated Qty",
    "In stock",
    "In transit in",
    "In transit out",
    "Minimum",
    "Alert",
    "State",
  ];
  titleRows(sheet, [`Current Inventory — ${locationName}`], headers.length);
  headerRow(sheet, headers);
  for (const row of rows)
    sheet.addRow([
      row.materialName,
      row.categoryName,
      row.uomName,
      number(row.estimatedQty),
      number(row.inStock),
      number(row.inTransitIn),
      number(row.inTransitOut),
      number(row.minimum),
      row.alertEnabled ? "On" : "Off",
      STOCK_STATE_LABELS[row.state],
    ]);
  [36, 24, 10, 14, 14, 14, 14, 12, 8, 14].forEach((width, index) => {
    const column = sheet.getColumn(index + 1);
    column.width = width;
    if (index >= 3 && index <= 7) column.numFmt = QUANTITY_FORMAT;
  });
  return toBytes(workbook);
}

/** The Stock Register for a date range. */
export async function stockRegisterExport(
  locationName: string,
  range: { from: CalendarDate; to: CalendarDate },
  rows: readonly StockRegisterRow[],
): Promise<Uint8Array<ArrayBuffer>> {
  const workbook = newWorkbook();
  const sheet = workbook.addWorksheet("Stock Register");
  const headers = [
    "Material",
    "Unit",
    ...STOCK_REGISTER_COLUMNS.map((column) => STOCK_REGISTER_LABELS[column]),
  ];
  titleRows(
    sheet,
    [`Stock Register — ${locationName}`, `${range.from} to ${range.to}`],
    headers.length,
  );
  headerRow(sheet, headers);
  for (const row of rows)
    sheet.addRow([
      row.materialName,
      row.uomName,
      ...STOCK_REGISTER_COLUMNS.map((column) => Number(row[column])),
    ]);
  sheet.getColumn(1).width = 36;
  sheet.getColumn(2).width = 10;
  STOCK_REGISTER_COLUMNS.forEach((_, index) => {
    const column = sheet.getColumn(index + 3);
    column.width = 14;
    column.numFmt = QUANTITY_FORMAT;
  });
  return toBytes(workbook);
}
