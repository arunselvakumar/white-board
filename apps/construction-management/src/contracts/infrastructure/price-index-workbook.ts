import ExcelJS from "exceljs";

import { DomainError } from "@/src/shared-kernel/domain-error";
import { xlsxUnpacksWithin } from "@/src/shared-kernel/xlsx-guard";

import type { StoredPriceIndex } from "../application/escalation-ports";
import {
  PRICE_INDEX_COLUMNS,
  PRICE_INDEX_IMPORT_ROWS_MAX,
  type PriceIndexCell,
  type PriceIndexColumnKey,
  type PriceIndexSheetRow,
} from "../application/price-index-handlers";
import { indexText } from "../domain/escalation";

/**
 * Price indices in Excel (CM-1109): one sheet, `Price indices`, with the
 * columns Series, Month (YYYY-MM) and Value. The export writes every index
 * in that shape, so it can be edited and imported back. `.xlsx` only.
 */

const SHEET = "Price indices";

const SAMPLE_ROWS: readonly (string | number)[][] = [
  ["CPI-IW", "2026-01", 140.2],
  ["WPI – All commodities", "2026-01", 154.6],
];

async function toBytes(
  workbook: ExcelJS.Workbook,
): Promise<Uint8Array<ArrayBuffer>> {
  const written = (await workbook.xlsx.writeBuffer()) as unknown as Uint8Array;
  return Uint8Array.from(written);
}

function indexSheet(workbook: ExcelJS.Workbook): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet(SHEET);
  PRICE_INDEX_COLUMNS.forEach((column, index) => {
    const target = sheet.getColumn(index + 1);
    target.width = column.width;
    target.numFmt = column.key === "value" ? "0.0000" : "@";
  });
  const header = sheet.addRow(
    PRICE_INDEX_COLUMNS.map((column) => column.header),
  );
  header.font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  return sheet;
}

/** The headers and two example rows. */
export async function priceIndexSample(): Promise<Uint8Array<ArrayBuffer>> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Construction Management";
  const sheet = indexSheet(workbook);
  for (const row of SAMPLE_ROWS) sheet.addRow([...row]);
  return toBytes(workbook);
}

/** Every index, by series then month, in the sample's columns. */
export async function priceIndexExport(
  rows: readonly StoredPriceIndex[],
): Promise<Uint8Array<ArrayBuffer>> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Construction Management";
  const sheet = indexSheet(workbook);
  for (const row of rows)
    // Index values have four places and at most eight whole digits, so
    // the number is exact.
    sheet.addRow([
      row.series,
      row.month.slice(0, 7),
      Number(indexText(row.value)),
    ]);
  return toBytes(workbook);
}

function cellValue(value: ExcelJS.CellValue): PriceIndexCell {
  if (value == null) return null;
  if (value instanceof Date || typeof value === "number") return value;
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    if ("richText" in value)
      return value.richText.map((part) => part.text).join("");
    if ("result" in value) {
      const result = value.result;
      if (
        result instanceof Date ||
        typeof result === "number" ||
        typeof result === "string"
      )
        return result;
      return null;
    }
    if ("text" in value) return value.text;
  }
  return null;
}

const headerKey = (raw: string) => raw.toLowerCase().replace(/[^a-z]/g, "");

const KEYS = new Map<string, PriceIndexColumnKey>([
  ...PRICE_INDEX_COLUMNS.map(
    (column) => [headerKey(column.header), column.key] as const,
  ),
  ["index", "series"],
  ["indexseries", "series"],
  ["indexvalue", "value"],
  ["period", "month"],
]);

function fileInvalid(message: string): DomainError {
  return new DomainError("IMPORT_FILE_INVALID", message);
}

/** The data rows of an uploaded sheet, columns found by header, blank rows skipped. */
export async function readPriceIndexSheet(
  bytes: Uint8Array,
): Promise<PriceIndexSheetRow[]> {
  if (
    bytes.byteLength < 4 ||
    bytes[0] !== 0x50 ||
    bytes[1] !== 0x4b ||
    bytes[2] !== 0x03 ||
    bytes[3] !== 0x04
  )
    throw fileInvalid("Upload the Excel (.xlsx) sample sheet.");
  if (!xlsxUnpacksWithin(bytes))
    throw fileInvalid(
      "This workbook is too large to import. Download the sample and fill it in.",
    );
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(Uint8Array.from(bytes).buffer);
  } catch {
    throw fileInvalid("This file could not be read as an Excel workbook.");
  }
  const sheet = workbook.getWorksheet(SHEET) ?? workbook.worksheets[0];
  if (sheet == null) throw fileInvalid("The workbook has no sheets.");
  const columns = new Map<number, PriceIndexColumnKey>();
  sheet.getRow(1).eachCell((cell, column) => {
    const found = KEYS.get(headerKey(String(cellValue(cell.value) ?? "")));
    if (found != null && ![...columns.values()].includes(found))
      columns.set(column, found);
  });
  if (columns.size < PRICE_INDEX_COLUMNS.length)
    throw fileInvalid(
      "The first row must be the sample's headers (Series, Month, Value). Download the sample and fill it in.",
    );
  const rows: PriceIndexSheetRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const cells: PriceIndexSheetRow["cells"] = {};
    let blank = true;
    for (const [column, key] of columns) {
      const value = cellValue(row.getCell(column).value);
      const empty =
        value == null || (typeof value === "string" && value.trim() === "");
      if (!empty) blank = false;
      cells[key] = empty ? null : value;
    }
    if (blank) return;
    if (rows.length >= PRICE_INDEX_IMPORT_ROWS_MAX)
      throw new DomainError(
        "IMPORT_TOO_MANY",
        `Import at most ${PRICE_INDEX_IMPORT_ROWS_MAX.toLocaleString("en-IN")} rows at a time.`,
      );
    rows.push({ row: rowNumber, cells });
  });
  return rows;
}
