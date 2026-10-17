import ExcelJS from "exceljs";

import { DomainError } from "@/src/shared-kernel/domain-error";
import { xlsxUnpacksWithin } from "@/src/shared-kernel/xlsx-guard";

import {
  UNIT_IMPORT_COLUMNS,
  type UnitImportCell,
  type UnitImportColumnKey,
  type UnitSampleRow,
  type UnitSheetRow,
} from "../application/unit-import";
import { SALES_LIMITS } from "../domain/sales-terms";

/**
 * The unit import sample and its reader (CM-1005, ADR CM-0022 §8), like
 * the task import (CM-802). `.xlsx` only.
 */

export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const SHEET = "Units";

async function toBytes(
  workbook: ExcelJS.Workbook,
): Promise<Uint8Array<ArrayBuffer>> {
  const written = (await workbook.xlsx.writeBuffer()) as unknown as Uint8Array;
  return Uint8Array.from(written);
}

const AREA_COLUMNS: readonly UnitImportColumnKey[] = [
  "carpetArea",
  "builtUpArea",
  "superBuiltUpArea",
];

/** The sample: the headers, then one row per unit with its current details. */
export async function unitImportSample(
  rows: readonly UnitSampleRow[],
): Promise<Uint8Array<ArrayBuffer>> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Construction Management";
  const sheet = workbook.addWorksheet(SHEET);
  UNIT_IMPORT_COLUMNS.forEach((column, index) => {
    const target = sheet.getColumn(index + 1);
    target.width = column.width;
    target.numFmt = AREA_COLUMNS.includes(column.key) ? "0.00" : "@";
  });
  const header = sheet.addRow(
    UNIT_IMPORT_COLUMNS.map((column) => column.header),
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
  for (const row of rows)
    sheet.addRow(UNIT_IMPORT_COLUMNS.map((column) => row[column.key]));
  return toBytes(workbook);
}

function cellValue(value: ExcelJS.CellValue): UnitImportCell {
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

const KEYS_BY_HEADER = new Map<string, UnitImportColumnKey>([
  ...UNIT_IMPORT_COLUMNS.map(
    (column) => [headerKey(column.header), column.key] as const,
  ),
  ["wingname", "wing"],
  ["unit", "unitNo"],
  ["unitname", "unitNo"],
  ["unitnumber", "unitNo"],
  ["type", "unitType"],
  ["carpet", "carpetArea"],
  ["builtup", "builtUpArea"],
  ["superbuiltup", "superBuiltUpArea"],
  ["superarea", "superBuiltUpArea"],
  ["uom", "areaUnit"],
  ["reason", "unavailableReason"],
]);

function fileInvalid(message: string): DomainError {
  return new DomainError("IMPORT_FILE_INVALID", message);
}

/** The data rows of an uploaded sheet, columns found by header, blank rows skipped. */
export async function readUnitSheet(
  bytes: Uint8Array,
): Promise<UnitSheetRow[]> {
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
  const columns = new Map<number, UnitImportColumnKey>();
  sheet.getRow(1).eachCell((cell, column) => {
    const key = KEYS_BY_HEADER.get(
      headerKey(String(cellValue(cell.value) ?? "")),
    );
    if (key != null && ![...columns.values()].includes(key))
      columns.set(column, key);
  });
  const found = [...columns.values()];
  if (!found.includes("wing") || !found.includes("unitNo"))
    throw fileInvalid(
      `The first row must be the sample's headers (${UNIT_IMPORT_COLUMNS.map((column) => column.header).join(", ")}). Download the sample and fill it in.`,
    );
  const rows: UnitSheetRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const cells: UnitSheetRow["cells"] = {};
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
    if (rows.length >= SALES_LIMITS.unitImportRows)
      throw new DomainError(
        "IMPORT_TOO_MANY",
        `Import at most ${SALES_LIMITS.unitImportRows.toLocaleString("en-IN")} rows at a time.`,
      );
    rows.push({ row: rowNumber, cells });
  });
  return rows;
}
