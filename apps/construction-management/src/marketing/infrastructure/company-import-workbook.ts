import ExcelJS from "exceljs";

import { DomainError } from "@/src/shared-kernel/domain-error";
import {
  xlsxHasMacros,
  xlsxUnpacksWithin,
} from "@/src/shared-kernel/xlsx-guard";

import {
  COMPANY_IMPORT_COLUMNS,
  MAX_COMPANY_IMPORT_ROWS,
  type CompanyImportColumnKey,
  type CompanySheetRow,
} from "../domain/company-import";

/**
 * The Prospect Company import's template and reader (ADR CM-0040 §11),
 * like the Labour import. `.xlsx` only, read through the xlsx guard.
 */

const SHEET = "Prospect Companies";

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE8EEF7" },
};

/** The template: the headers and one example row, every column as text. */
export async function companyImportTemplate(): Promise<
  Uint8Array<ArrayBuffer>
> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Construction Management";
  const sheet = workbook.addWorksheet(SHEET);
  COMPANY_IMPORT_COLUMNS.forEach((column, index) => {
    const target = sheet.getColumn(index + 1);
    target.width = column.width;
    // Text, so Excel keeps a mobile's or phone's leading zero.
    target.numFmt = "@";
  });
  const head = sheet.addRow(
    COMPANY_IMPORT_COLUMNS.map((column) => column.header),
  );
  head.font = { bold: true };
  head.eachCell((cell) => {
    cell.fill = HEADER_FILL;
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.addRow(COMPANY_IMPORT_COLUMNS.map((column) => column.example));
  // A Node Buffer at runtime; exceljs declares its own `Buffer` type.
  const written = (await workbook.xlsx.writeBuffer()) as unknown as Uint8Array;
  return Uint8Array.from(written);
}

function text(value: ExcelJS.CellValue): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  // A number typed into a General cell: a mobile like 9876543210.
  if (typeof value === "number")
    return Number.isInteger(value) ? value.toFixed(0) : String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("richText" in value)
      return value.richText.map((part) => part.text).join("");
    if ("result" in value) {
      const result = value.result;
      if (result == null || typeof result === "object")
        return result instanceof Date ? text(result) : null;
      return text(result);
    }
    if ("text" in value)
      return typeof value.text === "string" ? value.text : null;
  }
  return null;
}

function headerKey(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const KEYS_BY_HEADER = new Map<string, CompanyImportColumnKey>([
  ...COMPANY_IMPORT_COLUMNS.map(
    (column) => [headerKey(column.header), column.key] as const,
  ),
  ["companyname", "name"],
  ["company", "name"],
  ["prospectcompany", "name"],
  ["phonenumber", "phone"],
  ["officephone", "phone"],
  ["contactname", "contactName"],
  ["contact", "contactName"],
  ["primarycontact", "contactName"],
  ["contactmobile", "contactMobile"],
  ["mobile", "contactMobile"],
]);

function fileInvalid(message: string): DomainError {
  return new DomainError("IMPORT_FILE_INVALID", message);
}

/**
 * The data rows of an uploaded sheet (the "Prospect Companies" sheet, or
 * the first): columns found by their header in any case and spacing,
 * blank rows skipped, every cell as text. Refuses a file that is not an
 * .xlsx, carries macros, unpacks past the guard's limit, or has more than
 * `MAX_COMPANY_IMPORT_ROWS` rows.
 */
export async function readCompanySheet(
  bytes: Uint8Array,
): Promise<CompanySheetRow[]> {
  // An .xlsx is a zip file: `PK\x03\x04`.
  if (
    bytes.byteLength < 4 ||
    bytes[0] !== 0x50 ||
    bytes[1] !== 0x4b ||
    bytes[2] !== 0x03 ||
    bytes[3] !== 0x04
  )
    throw fileInvalid("Upload the Excel (.xlsx) template.");
  if (!xlsxUnpacksWithin(bytes))
    throw fileInvalid(
      "This workbook is too large to import. Download the template and fill it in.",
    );
  if (xlsxHasMacros(bytes))
    throw fileInvalid(
      "This workbook has macros. Save it as a plain Excel workbook (.xlsx) and upload it again.",
    );
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(Uint8Array.from(bytes).buffer);
  } catch {
    throw fileInvalid("This file could not be read as an Excel workbook.");
  }
  const sheet = workbook.getWorksheet(SHEET) ?? workbook.worksheets[0];
  if (sheet == null) throw fileInvalid("The workbook has no sheets.");

  const columns = new Map<number, CompanyImportColumnKey>();
  sheet.getRow(1).eachCell((cell, column) => {
    const key = KEYS_BY_HEADER.get(headerKey(text(cell.value) ?? ""));
    if (key != null && ![...columns.values()].includes(key))
      columns.set(column, key);
  });
  if (![...columns.values()].includes("name"))
    throw fileInvalid(
      `The first row must be the template's headers (${COMPANY_IMPORT_COLUMNS.map((column) => column.header).join(", ")}). Download the template and fill it in.`,
    );

  const rows: CompanySheetRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, number) => {
    if (number === 1) return;
    const cells: CompanySheetRow["cells"] = {};
    for (const [column, key] of columns) {
      const value = text(row.getCell(column).value);
      if (value != null && value.trim() !== "") cells[key] = value;
    }
    if (Object.keys(cells).length === 0) return;
    // Stop at the limit rather than holding every row of a huge sheet.
    if (rows.length >= MAX_COMPANY_IMPORT_ROWS)
      throw new DomainError(
        "IMPORT_TOO_MANY",
        `Import at most ${String(MAX_COMPANY_IMPORT_ROWS)} Prospect Companies at a time.`,
      );
    rows.push({ row: number, cells });
  });
  return rows;
}
