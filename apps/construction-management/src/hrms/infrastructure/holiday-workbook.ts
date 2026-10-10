import ExcelJS from "exceljs";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  HOLIDAY_COLUMNS,
  MAX_HOLIDAY_IMPORT_ROWS,
  type HolidayCell,
  type HolidayColumnKey,
  type HolidaySheetRow,
} from "../application/holiday-handlers";
import { HOLIDAY_TYPE_LABELS, HOLIDAY_TYPES } from "../domain/holiday";

/**
 * The holiday import sheet (CM-305), built the way the labour import is
 * (CM-206): a sample with headers, example rows and drop-downs, and a
 * reader that finds columns by their header. `.xlsx` only.
 */

export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const SHEET = "Holidays";
const LISTS = "Lists";
const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE8EEF7" },
};

const TYPE_NAMES = HOLIDAY_TYPES.map((type) => HOLIDAY_TYPE_LABELS[type]);
const YES_NO = ["Yes", "No"];

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

function columnIndex(key: HolidayColumnKey): number {
  return HOLIDAY_COLUMNS.findIndex((column) => column.key === key) + 1;
}

/**
 * The sample sheet: headers, two example rows for `year`, and drop-downs
 * for Type and Optional pointing at a Lists sheet.
 */
export async function holidaySample(
  year: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Construction Management";
  const sheet = workbook.addWorksheet(SHEET);
  HOLIDAY_COLUMNS.forEach((column, index) => {
    const target = sheet.getColumn(index + 1);
    target.width = column.width;
    target.numFmt = column.key === "date" ? "yyyy-mm-dd" : "@";
  });
  addHeader(
    sheet,
    HOLIDAY_COLUMNS.map((column) => column.header),
  );
  const yearText = String(year);
  sheet.addRow([
    "Republic Day",
    new Date(`${yearText}-01-26T00:00:00.000Z`),
    "National",
    "No",
    "Gazetted holiday",
  ]);
  sheet.addRow([
    "Company Foundation Day",
    new Date(`${yearText}-07-01T00:00:00.000Z`),
    "Company",
    "Yes",
    null,
  ]);

  const lists = workbook.addWorksheet(LISTS);
  addHeader(lists, ["Types", "Optional"]);
  for (let index = 0; index < TYPE_NAMES.length; index += 1)
    lists.addRow([TYPE_NAMES[index] ?? null, YES_NO[index] ?? null]);
  lists.getColumn(1).width = 16;
  lists.getColumn(2).width = 12;

  const drop = (key: HolidayColumnKey, range: string) => {
    const column = columnIndex(key);
    for (let row = 2; row <= MAX_HOLIDAY_IMPORT_ROWS + 1; row += 1)
      sheet.getCell(row, column).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [range],
      };
  };
  drop("type", `${LISTS}!$A$2:$A$${String(TYPE_NAMES.length + 1)}`);
  drop("optional", `${LISTS}!$B$2:$B$${String(YES_NO.length + 1)}`);
  return toBytes(workbook);
}

function cellValue(value: ExcelJS.CellValue): HolidayCell {
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
      return typeof result === "boolean" ? (result ? "Yes" : "No") : result;
    }
    if ("text" in value) return value.text;
  }
  return null;
}

function headerKey(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const KEYS_BY_HEADER = new Map<string, HolidayColumnKey>([
  ...HOLIDAY_COLUMNS.map(
    (column) => [headerKey(column.header), column.key] as const,
  ),
  ["name", "name"],
  ["holiday", "name"],
  ["holidaytype", "type"],
  ["optionalholiday", "optional"],
]);

function fileInvalid(message: string): DomainError {
  return new DomainError("IMPORT_FILE_INVALID", message);
}

/**
 * The data rows of an uploaded sheet (the "Holidays" sheet, or the first):
 * columns found by their header, blank rows skipped. 400
 * `IMPORT_FILE_INVALID` for anything that is not the sample's workbook.
 */
export async function readHolidaySheet(
  bytes: Uint8Array,
): Promise<HolidaySheetRow[]> {
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

  const columns = new Map<number, HolidayColumnKey>();
  sheet.getRow(1).eachCell((cell, column) => {
    const key = KEYS_BY_HEADER.get(
      headerKey(String(cellValue(cell.value) ?? "")),
    );
    if (key != null && ![...columns.values()].includes(key))
      columns.set(column, key);
  });
  const found = new Set(columns.values());
  if (!found.has("name") || !found.has("date"))
    throw fileInvalid(
      "The first row must be the sample's headers (Holiday Name, Date, Type…). Download the sample sheet and fill it in.",
    );

  const rows: HolidaySheetRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, number) => {
    if (number === 1) return;
    const cells: HolidaySheetRow["cells"] = {};
    let blank = true;
    for (const [column, key] of columns) {
      const value = cellValue(row.getCell(column).value);
      const empty =
        value == null || (typeof value === "string" && value.trim() === "");
      if (!empty) blank = false;
      cells[key] = empty ? null : value;
    }
    if (!blank) rows.push({ row: number, cells });
  });
  return rows;
}
