import ExcelJS from "exceljs";

import { DomainError } from "@/src/shared-kernel/domain-error";
import { xlsxUnpacksWithin } from "@/src/shared-kernel/xlsx-guard";

import type { BoqExportRow } from "../application/boq-handlers";
import {
  BOQ_IMPORT_COLUMNS,
  BOQ_IMPORT_ROWS_MAX,
  type BoqImportCell,
  type BoqImportColumnKey,
  type BoqSheetRow,
} from "../application/boq-import";
import { quantityText } from "../domain/boq";

/**
 * A Project's BOQ in Excel (CM-1103, ADR CM-0023 §4): the import sample,
 * its reader and the export. The import finds its columns by header, so
 * the export (which adds the original figures and the amount) imports
 * back by its Quantity and Rate (₹) columns. `.xlsx` only.
 */

export { XLSX_CONTENT_TYPE } from "./item-workbook";

const SHEET = "BOQ";

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE8EEF7" },
};

/**
 * The sample's example rows. Wing / Location and Library code are left
 * blank: a name or code the Company does not have would fail the import.
 */
function sampleRows(): (string | number | null)[][] {
  return [
    [
      "Earthwork",
      "1.1",
      "Earthwork in excavation by mechanical means over areas, including disposal of excavated earth up to 50 m.",
      "cum",
      "995411",
      450,
      285.5,
      null,
      null,
    ],
    [
      "Earthwork",
      "1.2",
      "Filling available excavated earth in trenches, plinth, sides of foundations in layers not exceeding 20 cm.",
      "cum",
      "995411",
      180,
      165,
      null,
      null,
    ],
    [
      "Concrete work",
      "2.1",
      "PCC 1:4:8 in foundations",
      "cum",
      "995411",
      32.5,
      6123.45,
      null,
      null,
    ],
  ];
}

async function toBytes(
  workbook: ExcelJS.Workbook,
): Promise<Uint8Array<ArrayBuffer>> {
  const written = (await workbook.xlsx.writeBuffer()) as unknown as Uint8Array;
  return Uint8Array.from(written);
}

type Column = {
  header: string;
  width: number;
  kind: "text" | "quantity" | "money";
  wrap?: boolean;
};

function sheetWith(workbook: ExcelJS.Workbook, columns: readonly Column[]) {
  const sheet = workbook.addWorksheet(SHEET);
  columns.forEach((column, index) => {
    const target = sheet.getColumn(index + 1);
    target.width = column.width;
    // Item numbers like 2.10 and SAC 0995 stay text.
    target.numFmt =
      column.kind === "money"
        ? "#,##0.00"
        : column.kind === "quantity"
          ? "#,##0.0000"
          : "@";
    if (column.wrap === true)
      target.alignment = { wrapText: true, vertical: "top" };
  });
  const header = sheet.addRow(columns.map((column) => column.header));
  header.font = { bold: true };
  header.eachCell((cell) => {
    cell.fill = HEADER_FILL;
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  return sheet;
}

const IMPORT_SHEET_COLUMNS: Column[] = BOQ_IMPORT_COLUMNS.map((column) => ({
  header: column.header,
  width: column.width,
  kind:
    column.key === "quantity"
      ? "quantity"
      : column.key === "rate"
        ? "money"
        : "text",
  wrap: column.key === "description",
}));

/** The import sample: the headers and example rows to overwrite. */
export async function boqImportSample(): Promise<Uint8Array<ArrayBuffer>> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Construction Management";
  const sheet = sheetWith(workbook, IMPORT_SHEET_COLUMNS);
  for (const row of sampleRows()) sheet.addRow(row);
  return toBytes(workbook);
}

const EXPORT_COLUMNS: Column[] = [
  { header: "Section", width: 26, kind: "text" },
  { header: "Item no", width: 10, kind: "text" },
  { header: "Description", width: 60, kind: "text", wrap: true },
  { header: "UoM", width: 10, kind: "text" },
  { header: "SAC/HSN", width: 11, kind: "text" },
  { header: "Original quantity", width: 14, kind: "quantity" },
  { header: "Quantity", width: 13, kind: "quantity" },
  { header: "Original rate (₹)", width: 15, kind: "money" },
  { header: "Rate (₹)", width: 14, kind: "money" },
  { header: "Amount (₹)", width: 16, kind: "money" },
  { header: "Wing / Location", width: 18, kind: "text" },
  { header: "Library code", width: 14, kind: "text" },
];

/** Rupees for a cell: paise are capped at ₹1,000 crore, so the number is exact. */
const rupees = (paise: bigint): number => Number(paise) / 100;

/** A quantity for a cell (four places are exact as a double below 10¹¹). */
const units = (value: bigint): number => Number(quantityText(value));

/** The whole BOQ with original and current figures, in BOQ order. */
export async function boqExport(
  rows: readonly BoqExportRow[],
): Promise<Uint8Array<ArrayBuffer>> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Construction Management";
  const sheet = sheetWith(workbook, EXPORT_COLUMNS);
  for (const { sectionTitle, item } of rows)
    sheet.addRow([
      sectionTitle,
      item.itemNo,
      item.description,
      item.uomName,
      item.sacHsn,
      units(item.originalQuantity),
      units(item.quantity),
      rupees(item.originalRate),
      rupees(item.rate),
      rupees(item.amount),
      item.placeName,
      item.libraryCode,
    ]);
  return toBytes(workbook);
}

function cellValue(value: ExcelJS.CellValue): BoqImportCell {
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

const KEYS_BY_HEADER = new Map<string, BoqImportColumnKey>([
  ...BOQ_IMPORT_COLUMNS.map(
    (column) => [headerKey(column.header), column.key] as const,
  ),
  ["sectiontitle", "section"],
  ["itemnumber", "itemNo"],
  ["no", "itemNo"],
  ["unit", "uom"],
  ["sac", "sacHsn"],
  ["hsn", "sacHsn"],
  ["qty", "quantity"],
  ["rate", "rate"],
  ["raters", "rate"],
  ["wing", "place"],
  ["location", "place"],
  ["itemcode", "libraryCode"],
  ["code", "libraryCode"],
]);

function fileInvalid(message: string): DomainError {
  return new DomainError("IMPORT_FILE_INVALID", message);
}

/** The data rows of an uploaded sheet, columns found by header, blank rows skipped. */
export async function readBoqSheet(bytes: Uint8Array): Promise<BoqSheetRow[]> {
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
  const columns = new Map<number, BoqImportColumnKey>();
  sheet.getRow(1).eachCell((cell, column) => {
    const found = KEYS_BY_HEADER.get(
      headerKey(String(cellValue(cell.value) ?? "")),
    );
    if (found != null && ![...columns.values()].includes(found))
      columns.set(column, found);
  });
  const keys = [...columns.values()];
  if (!keys.includes("itemNo") || !keys.includes("section"))
    throw fileInvalid(
      `The first row must be the sample's headers (${BOQ_IMPORT_COLUMNS.map((column) => column.header).join(", ")}). Download the sample and fill it in.`,
    );
  const rows: BoqSheetRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const cells: BoqSheetRow["cells"] = {};
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
    if (rows.length >= BOQ_IMPORT_ROWS_MAX)
      throw new DomainError(
        "IMPORT_TOO_MANY",
        `Import at most ${BOQ_IMPORT_ROWS_MAX.toLocaleString("en-IN")} rows at a time.`,
      );
    rows.push({ row: rowNumber, cells });
  });
  return rows;
}
