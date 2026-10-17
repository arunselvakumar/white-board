import ExcelJS from "exceljs";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  INQUIRY_IMPORT_COLUMNS,
  type InquiryImportCell,
  type InquiryImportColumnKey,
  type InquiryImportLists,
  type InquirySheetRow,
} from "../application/inquiry-import";

/**
 * The inquiry import sample and its reader (CM-1007, ADR CM-0022 §9),
 * like the unit import. `.xlsx` only. The sample has the headers on its
 * Inquiries sheet and, on a Lists sheet, the Project's live Lead Sources,
 * Funnel Stages, Wings and Team Members to copy names from.
 */

export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const SHEET = "Inquiries";

async function toBytes(
  workbook: ExcelJS.Workbook,
): Promise<Uint8Array<ArrayBuffer>> {
  const written = (await workbook.xlsx.writeBuffer()) as unknown as Uint8Array;
  return Uint8Array.from(written);
}

function boldHeader(row: ExcelJS.Row): void {
  row.font = { bold: true };
  row.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE8EEF7" },
    };
  });
}

export async function inquiryImportSample(
  lists: InquiryImportLists,
): Promise<Uint8Array<ArrayBuffer>> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Construction Management";
  const sheet = workbook.addWorksheet(SHEET);
  INQUIRY_IMPORT_COLUMNS.forEach((column, index) => {
    const target = sheet.getColumn(index + 1);
    target.width = column.width;
    target.numFmt = "@";
  });
  boldHeader(
    sheet.addRow(INQUIRY_IMPORT_COLUMNS.map((column) => column.header)),
  );
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const names = workbook.addWorksheet("Lists");
  const columns: [string, readonly string[]][] = [
    ["Lead Source", lists.leadSources],
    ["Funnel Stage", lists.funnelStages],
    ["Interested In Wing", lists.wings],
    ["Assignee", lists.members],
    ["Interest Type", ["Hot", "Warm", "Cold"]],
  ];
  columns.forEach(([, values], index) => {
    names.getColumn(index + 1).width = Math.max(
      18,
      ...values.map((value) => value.length + 2),
    );
  });
  boldHeader(names.addRow(columns.map(([header]) => header)));
  const longest = Math.max(...columns.map(([, values]) => values.length));
  for (let at = 0; at < longest; at += 1)
    names.addRow(columns.map(([, values]) => values[at] ?? null));
  return toBytes(workbook);
}

function cellValue(value: ExcelJS.CellValue): InquiryImportCell {
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

const KEYS_BY_HEADER = new Map<string, InquiryImportColumnKey>([
  ...INQUIRY_IMPORT_COLUMNS.map(
    (column) => [headerKey(column.header), column.key] as const,
  ),
  ["date", "inquiryDate"],
  ["phone", "mobile"],
  ["mobileno", "mobile"],
  ["interest", "interestType"],
  ["wing", "wing"],
  ["interestedin", "wing"],
  ["source", "leadSource"],
  ["stage", "stage"],
  ["assignedto", "assignee"],
  ["followup", "nextFollowUp"],
  ["nextfollowupdate", "nextFollowUp"],
]);

function fileInvalid(message: string): DomainError {
  return new DomainError("IMPORT_FILE_INVALID", message);
}

/** The data rows of an uploaded sheet, columns found by header, blank rows skipped. */
export async function readInquirySheet(
  bytes: Uint8Array,
): Promise<InquirySheetRow[]> {
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
  const columns = new Map<number, InquiryImportColumnKey>();
  sheet.getRow(1).eachCell((cell, column) => {
    const found = KEYS_BY_HEADER.get(
      headerKey(String(cellValue(cell.value) ?? "")),
    );
    if (found != null && ![...columns.values()].includes(found))
      columns.set(column, found);
  });
  if (![...columns.values()].includes("name"))
    throw fileInvalid(
      `The first row must be the sample's headers (${INQUIRY_IMPORT_COLUMNS.map((column) => column.header).join(", ")}). Download the sample and fill it in.`,
    );
  const rows: InquirySheetRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const cells: InquirySheetRow["cells"] = {};
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
