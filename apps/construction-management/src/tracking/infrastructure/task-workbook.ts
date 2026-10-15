import ExcelJS from "exceljs";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  TASK_IMPORT_COLUMNS,
  type ImportCell,
  type TaskImportColumnKey,
  type TaskSheetRow,
} from "../application/task-import";

/**
 * The task import sample and its reader (CM-802, ADR CM-0019 §13), like
 * M7's Transactions import. `.xlsx` only.
 */

export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const SHEET = "Tasks";

async function toBytes(
  workbook: ExcelJS.Workbook,
): Promise<Uint8Array<ArrayBuffer>> {
  const written = (await workbook.xlsx.writeBuffer()) as unknown as Uint8Array;
  return Uint8Array.from(written);
}

/**
 * The sample: the headers and three example rows (a task and two
 * sub-tasks), naming the Team Member and the unit given.
 */
export async function taskImportSample(example: {
  memberName: string;
  unitName: string;
}): Promise<Uint8Array<ArrayBuffer>> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Construction Management";
  const sheet = workbook.addWorksheet(SHEET);
  TASK_IMPORT_COLUMNS.forEach((column, index) => {
    const target = sheet.getColumn(index + 1);
    target.width = column.width;
    if (column.key === "totalPrice") target.numFmt = "#,##0.00";
    else if (column.key === "totalWork") target.numFmt = "0.###";
    else if (column.key === "startDate" || column.key === "dueDate")
      target.numFmt = "dd/mm/yyyy";
    else target.numFmt = "@";
  });
  const header = sheet.addRow(
    TASK_IMPORT_COLUMNS.map((column) => column.header),
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
  const day = (d: number) => new Date(Date.UTC(2026, 10, d));
  sheet.addRow([
    "1",
    "",
    "Tower A structure",
    "Frame up to the terrace",
    day(2),
    day(30),
    "High",
    "",
    "",
    "",
    "Structure",
    "",
    "",
    "",
  ]);
  sheet.addRow([
    "1.1",
    "1",
    "Ground floor columns",
    "",
    day(2),
    day(9),
    "Medium",
    example.memberName,
    "",
    "",
    "Structure",
    48,
    example.unitName,
    250000,
  ]);
  sheet.addRow([
    "1.2",
    "1",
    "First floor slab",
    "",
    day(10),
    day(30),
    "High",
    example.memberName,
    "",
    "",
    "",
    "",
    "",
    "",
  ]);
  return toBytes(workbook);
}

function cellValue(value: ExcelJS.CellValue): ImportCell {
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

const KEYS_BY_HEADER = new Map<string, TaskImportColumnKey>([
  ...TASK_IMPORT_COLUMNS.map(
    (column) => [headerKey(column.header), column.key] as const,
  ),
  ["taskname", "name"],
  ["name", "name"],
  ["parent", "parentRef"],
  ["assignto", "assignees"],
  ["assignee", "assignees"],
  ["totalworkqty", "totalWork"],
  ["quantity", "totalWork"],
  ["uom", "unit"],
  ["price", "totalPrice"],
]);

function fileInvalid(message: string): DomainError {
  return new DomainError("IMPORT_FILE_INVALID", message);
}

/** The data rows of an uploaded sheet, columns found by header, blank rows skipped. */
export async function readTaskSheet(
  bytes: Uint8Array,
): Promise<TaskSheetRow[]> {
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
  const columns = new Map<number, TaskImportColumnKey>();
  sheet.getRow(1).eachCell((cell, column) => {
    const key = KEYS_BY_HEADER.get(
      headerKey(String(cellValue(cell.value) ?? "")),
    );
    if (key != null && ![...columns.values()].includes(key))
      columns.set(column, key);
  });
  if (![...columns.values()].includes("name"))
    throw fileInvalid(
      "The first row must be the sample's headers (Ref, Parent Ref, Task Name*, Description, Start Date, Due Date, Priority, Assignees, Department, Contractor, Tags, Total Work, Unit, Total Price). Download the sample and fill it in.",
    );
  const rows: TaskSheetRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const cells: TaskSheetRow["cells"] = {};
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
