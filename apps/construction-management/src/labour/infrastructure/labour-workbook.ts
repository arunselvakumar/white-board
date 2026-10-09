import ExcelJS from "exceljs";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  LABOUR_COLUMNS,
  MAX_IMPORT_ROWS,
  WEEKDAY_NAMES,
  type LabourCell,
  type LabourColumnKey,
  type LabourSheetRow,
} from "../application/labour-columns";
import type { LabourReadModel } from "../application/labour-ports";

export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const SHEET = "Labours";
const LISTS = "Lists";
const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE8EEF7" },
};

function letter(index: number): string {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

function addHeader(sheet: ExcelJS.Worksheet, headers: string[]): void {
  const row = sheet.addRow(headers);
  row.font = { bold: true };
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

function setColumns(sheet: ExcelJS.Worksheet): void {
  LABOUR_COLUMNS.forEach((column, index) => {
    const target = sheet.getColumn(index + 1);
    target.width = column.width;
    if ("text" in column) target.numFmt = "@";
    if ("date" in column) target.numFmt = "yyyy-mm-dd";
    if ("money" in column) target.numFmt = "#,##0.00";
  });
}

async function toBytes(
  workbook: ExcelJS.Workbook,
): Promise<Uint8Array<ArrayBuffer>> {
  // A Node Buffer at runtime; exceljs declares its own `Buffer` type.
  const written = (await workbook.xlsx.writeBuffer()) as unknown as Uint8Array;
  return Uint8Array.from(written);
}

/**
 * The sample sheet (CM-206): the header row, one example row, and a second
 * sheet listing the Company's Projects, Labour Categories and Supervisors
 * with drop-downs pointing at them.
 */
export async function labourTemplate(lists: {
  projects: string[];
  labourCategories: string[];
  supervisors: string[];
}): Promise<Uint8Array<ArrayBuffer>> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Construction Management";
  const sheet = workbook.addWorksheet(SHEET);
  setColumns(sheet);
  addHeader(
    sheet,
    LABOUR_COLUMNS.map((column) => column.header),
  );
  sheet.addRow(
    LABOUR_COLUMNS.map((column) => {
      if (column.key === "project") return lists.projects[0] ?? "Your Project";
      if (column.key === "labourCategory")
        return lists.labourCategories[0] ?? null;
      return column.example;
    }),
  );

  const listSheet = workbook.addWorksheet(LISTS);
  const listColumns: [string, string[]][] = [
    ["Projects", lists.projects],
    ["Labour Categories", lists.labourCategories],
    ["Supervisors", lists.supervisors],
    ["Wage Types", ["Daily", "Monthly"]],
    ["Genders", ["Male", "Female", "Other"]],
    ["Weekdays", WEEKDAY_NAMES],
  ];
  addHeader(
    listSheet,
    listColumns.map(([title]) => title),
  );
  const longest = Math.max(...listColumns.map(([, values]) => values.length));
  for (let index = 0; index < longest; index += 1)
    listSheet.addRow(listColumns.map(([, values]) => values[index] ?? null));
  listColumns.forEach((_, index) => {
    listSheet.getColumn(index + 1).width = 26;
  });

  // Drop-downs on the data rows, pointing at the Lists sheet.
  const dropDowns: [LabourColumnKey, number][] = [
    ["project", 0],
    ["labourCategory", 1],
    ["supervisor", 2],
    ["wageType", 3],
    ["gender", 4],
  ];
  for (const [key, listIndex] of dropDowns) {
    const values = listColumns[listIndex]?.[1] ?? [];
    if (values.length === 0) continue;
    const column = LABOUR_COLUMNS.findIndex((item) => item.key === key) + 1;
    const range = `${LISTS}!$${letter(listIndex)}$2:$${letter(listIndex)}$${String(values.length + 1)}`;
    for (let row = 2; row <= MAX_IMPORT_ROWS + 1; row += 1)
      sheet.getCell(row, column).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [range],
      };
  }
  return toBytes(workbook);
}

const rupees = (paise: number | null) => (paise == null ? null : paise / 100);

const WEEKDAYS = (days: readonly number[]) =>
  days.map((day) => WEEKDAY_NAMES[day] ?? "").join(", ");

/**
 * The register as a sheet (CM-206): the template's columns plus Status and
 * Balance, so an export reads like the import. Without Financial the
 * amounts are blank; Aadhaar is always masked.
 */
export async function labourExport(
  labours: readonly LabourReadModel[],
  financial: boolean,
): Promise<Uint8Array<ArrayBuffer>> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Construction Management";
  const sheet = workbook.addWorksheet(SHEET);
  setColumns(sheet);
  addHeader(sheet, [
    ...LABOUR_COLUMNS.map((column) => column.header.replace("*", "")),
    "Status",
    "Balance (₹)",
  ]);
  sheet.getColumn(LABOUR_COLUMNS.length + 1).width = 10;
  sheet.getColumn(LABOUR_COLUMNS.length + 2).width = 16;
  sheet.getColumn(LABOUR_COLUMNS.length + 2).numFmt = "#,##0.00";
  const money = (paise: number | null) => (financial ? rupees(paise) : null);
  for (const labour of labours) {
    const { details } = labour;
    const values: Record<LabourColumnKey, LabourCell> = {
      name: details.name,
      labourCode: details.labourCode,
      fatherName: details.fatherName,
      joiningDate: details.joiningDate,
      wageType: details.wageType === "daily" ? "Daily" : "Monthly",
      wagePerDay: money(details.wagePerDay),
      wagePerMonth: money(details.wagePerMonth),
      overtimeWagePerHour: money(details.overtimeWagePerHour),
      weeklyHolidays: WEEKDAYS(details.weeklyHolidays),
      openingBalance: money(labour.openingBalance),
      project: labour.currentProject.name,
      labourCategory: labour.labourCategory?.name ?? null,
      supervisor: labour.supervisor?.name ?? null,
      contactNumber: details.contactNumber,
      gender:
        details.gender == null
          ? null
          : details.gender.charAt(0).toUpperCase() + details.gender.slice(1),
      uanNumber: details.uanNumber,
      esicNumber: details.esicNumber,
      aadhaar: labour.aadhaarMasked,
    };
    sheet.addRow([
      ...LABOUR_COLUMNS.map((column) => values[column.key]),
      labour.isActive ? "Active" : "Inactive",
      money(labour.balance),
    ]);
  }
  return toBytes(workbook);
}

function cellValue(value: ExcelJS.CellValue): LabourCell {
  if (value == null) return null;
  if (value instanceof Date || typeof value === "number") return value;
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") {
    if ("richText" in value)
      return value.richText.map((part) => part.text).join("");
    if ("result" in value) {
      const result = value.result;
      if (result == null || typeof result === "object") {
        return result instanceof Date ? result : null;
      }
      return typeof result === "boolean" ? String(result) : result;
    }
    if ("text" in value) return value.text;
  }
  return null;
}

function headerKey(raw: string): string {
  return raw.toLowerCase().replace(/\(₹\)|\*|[^a-z0-9]/g, "");
}

const KEYS_BY_HEADER = new Map<string, LabourColumnKey>(
  LABOUR_COLUMNS.map((column) => [headerKey(column.header), column.key]),
);

function fileInvalid(message: string): DomainError {
  return new DomainError("IMPORT_FILE_INVALID", message);
}

/**
 * The data rows of an uploaded sheet (the "Labours" sheet, or the first):
 * columns found by their header, blank rows skipped.
 */
export async function readLabourSheet(
  bytes: Uint8Array,
): Promise<LabourSheetRow[]> {
  // An .xlsx is a zip file: `PK\x03\x04`.
  if (
    bytes.byteLength < 4 ||
    bytes[0] !== 0x50 ||
    bytes[1] !== 0x4b ||
    bytes[2] !== 0x03 ||
    bytes[3] !== 0x04
  )
    throw fileInvalid("Upload the Excel (.xlsx) template.");
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(Uint8Array.from(bytes).buffer);
  } catch {
    throw fileInvalid("This file could not be read as an Excel workbook.");
  }
  const sheet = workbook.getWorksheet(SHEET) ?? workbook.worksheets[0];
  if (sheet == null) throw fileInvalid("The workbook has no sheets.");

  const columns = new Map<number, LabourColumnKey>();
  sheet.getRow(1).eachCell((cell, column) => {
    const key = KEYS_BY_HEADER.get(
      headerKey(String(cellValue(cell.value) ?? "")),
    );
    if (key != null) columns.set(column, key);
  });
  if (![...columns.values()].includes("name"))
    throw fileInvalid(
      "The first row must be the template's headers. Download the sample sheet and fill it in.",
    );

  const rows: LabourSheetRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, number) => {
    if (number === 1) return;
    const cells: LabourSheetRow["cells"] = {};
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
