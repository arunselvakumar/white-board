import ExcelJS from "exceljs";

import { DomainError } from "@/src/shared-kernel/domain-error";
import { xlsxUnpacksWithin } from "@/src/shared-kernel/xlsx-guard";

import type { ItemSummaryView } from "../application/item-handlers";
import {
  ITEM_IMPORT_COLUMNS,
  ITEM_IMPORT_ROWS_MAX,
  type ItemImportCell,
  type ItemImportColumnKey,
  type ItemSheetRow,
} from "../application/item-import";

/**
 * The Item Library in Excel (CM-1102, ADR CM-0023 §3): the import sample,
 * its reader and the export, all on one sheet with the same columns
 * (Code, Short description, Description, UoM, SAC/HSN, Schedule, Rate (₹)).
 * `.xlsx` only. An export can be changed and imported back.
 */

export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const SHEET = "Items";

/** The two example rows of the sample. */
const SAMPLE_ROWS: readonly (string | number)[][] = [
  [
    "5.1.1",
    "PCC 1:4:8 in foundations",
    "Providing and laying in position cement concrete of specified grade excluding the cost of centering and shuttering - All work up to plinth level: 1:4:8 (1 Cement : 4 coarse sand : 8 graded stone aggregate 40 mm nominal size).",
    "cum",
    "995411",
    "CPWD DSR 2023",
    6123.45,
  ],
  [
    "OWN-PL-01",
    "12 mm cement plaster 1:6",
    "12 mm cement plaster of mix 1:6 (1 cement : 6 fine sand) on walls, finished smooth.",
    "sqm",
    "995454",
    "Own",
    285,
  ],
];

async function toBytes(
  workbook: ExcelJS.Workbook,
): Promise<Uint8Array<ArrayBuffer>> {
  const written = (await workbook.xlsx.writeBuffer()) as unknown as Uint8Array;
  return Uint8Array.from(written);
}

function itemsSheet(workbook: ExcelJS.Workbook): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet(SHEET);
  ITEM_IMPORT_COLUMNS.forEach((column, index) => {
    const target = sheet.getColumn(index + 1);
    target.width = column.width;
    // Codes like 5.10 and SAC 0995 stay text; the rate is a number.
    target.numFmt = column.key === "rate" ? "#,##0.00" : "@";
    if (column.key === "description" || column.key === "shortDescription")
      target.alignment = { wrapText: true, vertical: "top" };
  });
  const header = sheet.addRow(
    ITEM_IMPORT_COLUMNS.map((column) => column.header),
  );
  header.font = { bold: true };
  header.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE8EEF7" },
    };
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  return sheet;
}

/** The import sample: the headers and two example rows to overwrite. */
export async function itemImportSample(): Promise<Uint8Array<ArrayBuffer>> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Construction Management";
  const sheet = itemsSheet(workbook);
  for (const row of SAMPLE_ROWS) sheet.addRow([...row]);
  return toBytes(workbook);
}

/** The Items of the current filter, in the sample's columns. */
export async function itemExport(
  items: readonly ItemSummaryView[],
): Promise<Uint8Array<ArrayBuffer>> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Construction Management";
  const sheet = itemsSheet(workbook);
  for (const item of items)
    sheet.addRow([
      item.code,
      item.shortDescription,
      item.description,
      item.uomName,
      item.sacHsn,
      item.schedule,
      // Paise are capped at ₹1,000 crore, so the number is exact.
      Number(item.adoptedRate) / 100,
    ]);
  return toBytes(workbook);
}

function cellValue(value: ExcelJS.CellValue): ItemImportCell {
  if (value == null) return null;
  if (value instanceof Date || typeof value === "number") return value;
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") {
    if ("richText" in value)
      return value.richText.map((part) => part.text).join("");
    if ("result" in value) {
      const result = value.result;
      if (result instanceof Date) return result;
      if (typeof result === "number" || typeof result === "string")
        return result;
      return null;
    }
    if ("text" in value) return value.text;
  }
  return null;
}

function headerKey(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const KEYS_BY_HEADER = new Map<string, ItemImportColumnKey>([
  ...ITEM_IMPORT_COLUMNS.map(
    (column) => [headerKey(column.header), column.key] as const,
  ),
  ["itemcode", "code"],
  ["shortdesc", "shortDescription"],
  ["longdescription", "description"],
  ["unit", "uom"],
  ["sac", "sacHsn"],
  ["hsn", "sacHsn"],
  ["sachsncode", "sacHsn"],
  ["rate", "rate"],
  ["raters", "rate"],
  ["adoptedrate", "rate"],
]);

function fileInvalid(message: string): DomainError {
  return new DomainError("IMPORT_FILE_INVALID", message);
}

/** The data rows of an uploaded sheet, columns found by header, blank rows skipped. */
export async function readItemSheet(
  bytes: Uint8Array,
): Promise<ItemSheetRow[]> {
  if (
    bytes.byteLength < 4 ||
    bytes[0] !== 0x50 ||
    bytes[1] !== 0x4b ||
    bytes[2] !== 0x03 ||
    bytes[3] !== 0x04
  )
    throw fileInvalid("Upload the Excel (.xlsx) sample sheet.");
  // Refuse a workbook that would unpack to more than any sheet needs
  // before the parser inflates it.
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
  const columns = new Map<number, ItemImportColumnKey>();
  sheet.getRow(1).eachCell((cell, column) => {
    const found = KEYS_BY_HEADER.get(
      headerKey(String(cellValue(cell.value) ?? "")),
    );
    if (found != null && ![...columns.values()].includes(found))
      columns.set(column, found);
  });
  if (![...columns.values()].includes("code"))
    throw fileInvalid(
      `The first row must be the sample's headers (${ITEM_IMPORT_COLUMNS.map((column) => column.header).join(", ")}). Download the sample and fill it in.`,
    );
  const rows: ItemSheetRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const cells: ItemSheetRow["cells"] = {};
    let blank = true;
    for (const [column, key] of columns) {
      const value = cellValue(row.getCell(column).value);
      const empty =
        value == null || (typeof value === "string" && value.trim() === "");
      if (!empty) blank = false;
      cells[key] = empty ? null : value;
    }
    if (blank) return;
    // Stop at the limit rather than holding every row of a huge sheet.
    if (rows.length >= ITEM_IMPORT_ROWS_MAX)
      throw new DomainError(
        "IMPORT_TOO_MANY",
        `Import at most ${ITEM_IMPORT_ROWS_MAX.toLocaleString("en-IN")} rows at a time.`,
      );
    rows.push({ row: rowNumber, cells });
  });
  return rows;
}
