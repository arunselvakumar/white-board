import type { Prisma } from "@repo/construction-db";
import ExcelJS from "exceljs";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  TRANSACTION_IMPORT_COLUMNS,
  type ImportCell,
  type TransactionImportColumnKey,
  type TransactionSheetRow,
} from "../application/transaction-import";

/**
 * The Transactions import sample and its reader (CM-702), like Import
 * Inventory Stock (M5). `.xlsx` only.
 */

export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const SHEET = "Transactions";

async function toBytes(
  workbook: ExcelJS.Workbook,
): Promise<Uint8Array<ArrayBuffer>> {
  const written = (await workbook.xlsx.writeBuffer()) as unknown as Uint8Array;
  return Uint8Array.from(written);
}

/** The sample: the headers and one example row, the account named as given. */
export async function transactionImportSample(
  accountName: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Construction Management";
  const sheet = workbook.addWorksheet(SHEET);
  TRANSACTION_IMPORT_COLUMNS.forEach((column, index) => {
    const target = sheet.getColumn(index + 1);
    target.width = column.width;
    if (column.key === "amount") target.numFmt = "#,##0.00";
    else if (column.key === "date") target.numFmt = "dd/mm/yyyy";
    else target.numFmt = "@";
  });
  const header = sheet.addRow(
    TRANSACTION_IMPORT_COLUMNS.map((column) => column.header),
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
  sheet.addRow([
    new Date(Date.UTC(2026, 9, 5)),
    "Payment Out",
    accountName,
    "Online",
    "UTR123456789",
    "Miscellaneous",
    "HDFC Bank",
    250,
    "Quarterly account charges",
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

const KEYS_BY_HEADER = new Map<string, TransactionImportColumnKey>([
  ...TRANSACTION_IMPORT_COLUMNS.map(
    (column) => [headerKey(column.header), column.key] as const,
  ),
  ["transactiontype", "type"],
  ["bankcashaccount", "account"],
  ["paymentmode", "mode"],
  ["chequeno", "reference"],
  ["reference", "reference"],
  ["referencenumber", "reference"],
  ["category", "category"],
  ["paidto", "counterparty"],
  ["receivedfrom", "counterparty"],
  ["amount", "amount"],
]);

function fileInvalid(message: string): DomainError {
  return new DomainError("IMPORT_FILE_INVALID", message);
}

/** The data rows of an uploaded sheet, columns found by header, blank rows skipped. */
export async function readTransactionSheet(
  bytes: Uint8Array,
): Promise<TransactionSheetRow[]> {
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
  const columns = new Map<number, TransactionImportColumnKey>();
  sheet.getRow(1).eachCell((cell, column) => {
    const key = KEYS_BY_HEADER.get(
      headerKey(String(cellValue(cell.value) ?? "")),
    );
    if (key != null && ![...columns.values()].includes(key))
      columns.set(column, key);
  });
  const found = new Set(columns.values());
  for (const required of ["date", "type", "account", "mode", "amount"] as const)
    if (!found.has(required))
      throw fileInvalid(
        "The first row must be the sample's headers (Date, Type, Account, Mode, Cheque No / Reference, Payment Category, Paid To / Received From, Amount (₹), Description). Download the sample and fill it in.",
      );
  const rows: TransactionSheetRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const cells: TransactionSheetRow["cells"] = {};
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

/** Live accounts and Payment Categories by name, for the import. */
export const prismaImportNames = async (
  db: Prisma.TransactionClient,
  workspaceId: string,
) => {
  const [accounts, categories] = await Promise.all([
    db.constructionFinanceAccount.findMany({
      where: { workspaceId, deletedAt: null },
      select: { id: true, name: true },
    }),
    db.constructionFinancePaymentCategory.findMany({
      where: { workspaceId, deletedAt: null },
      select: { id: true, name: true, disabledAt: true },
    }),
  ]);
  return {
    accounts,
    categories: categories.map((row) => ({
      id: row.id,
      name: row.name,
      disabled: row.disabledAt != null,
    })),
  };
};
