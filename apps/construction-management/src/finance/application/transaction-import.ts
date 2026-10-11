import { assertCan, type MemberAccess } from "@/src/shared-kernel/access";
import {
  isCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";

import type { PaymentMode } from "../domain/ledger";
import type { FinanceDb, Tx } from "./account-handlers";
import { TRANSACTIONS_MENU } from "./transaction-common";
import type {
  BackdatedCheck,
  CreateTransactionInput,
  TransactionHandlers,
  TransactionType,
} from "./transaction-handlers";

/**
 * Import Transactions from the xlsx sample (CM-702, ADR CM-0017 §5): all
 * rows or none, each error named by its row and column. Imported rows are
 * pending Transactions on the Project, with the Paid To / Received From as
 * a typed name, and share one `import_batch_id`.
 */

export const TRANSACTION_IMPORT_COLUMNS = [
  { key: "date", header: "Date", width: 14 },
  { key: "type", header: "Type", width: 14 },
  { key: "account", header: "Account", width: 28 },
  { key: "mode", header: "Mode", width: 10 },
  { key: "reference", header: "Cheque No / Reference", width: 24 },
  { key: "category", header: "Payment Category", width: 22 },
  { key: "counterparty", header: "Paid To / Received From", width: 28 },
  { key: "amount", header: "Amount (₹)", width: 16 },
  { key: "description", header: "Description", width: 40 },
] as const;

export type TransactionImportColumnKey =
  (typeof TRANSACTION_IMPORT_COLUMNS)[number]["key"];

export type ImportCell = string | number | Date | null;

export type TransactionSheetRow = {
  /** The row number in the sheet (the header is row 1). */
  row: number;
  cells: Partial<Record<TransactionImportColumnKey, ImportCell>>;
};

export type ImportRowError = { row: number; field: string; message: string };

export const TRANSACTION_IMPORT_MAX_ROWS = 500;

const HEADER_OF = Object.fromEntries(
  TRANSACTION_IMPORT_COLUMNS.map((column) => [column.key, column.header]),
) as Record<TransactionImportColumnKey, string>;

/** A command's error field as the sheet's column. */
const COLUMN_OF_FIELD: Record<string, TransactionImportColumnKey> = {
  transactionDate: "date",
  type: "type",
  accountId: "account",
  mode: "mode",
  chequeNumber: "reference",
  reference: "reference",
  paymentCategoryId: "category",
  counterparty: "counterparty",
  amount: "amount",
  description: "description",
};

function text(cell: ImportCell | undefined): string {
  if (cell == null) return "";
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  return String(cell).trim();
}

/** A date cell: an Excel date, `YYYY-MM-DD`, or `DD/MM/YYYY` (or `-`, `.`). */
export function importDate(cell: ImportCell | undefined): CalendarDate | null {
  if (cell instanceof Date)
    return Number.isNaN(cell.getTime())
      ? null
      : cell.toISOString().slice(0, 10);
  const value = text(cell);
  if (isCalendarDate(value)) return value;
  const match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(value);
  if (match == null) return null;
  const date = `${match[3] ?? ""}-${(match[2] ?? "").padStart(2, "0")}-${(match[1] ?? "").padStart(2, "0")}`;
  return isCalendarDate(date) ? date : null;
}

/** Rupees as a number or text (`1,500.50`) → paise; null when not an amount. */
export function importAmount(cell: ImportCell | undefined): bigint | null {
  if (typeof cell === "number") {
    if (!Number.isFinite(cell)) return null;
    const paise = Math.round(cell * 100);
    if (Math.abs(cell * 100 - paise) > 1e-6) return null;
    return BigInt(paise);
  }
  const value = text(cell).replace(/[,₹\s]/g, "");
  const match = /^(\d{1,11})(?:\.(\d{1,2}))?$/.exec(value);
  if (match == null) return null;
  return (
    BigInt(match[1] ?? "0") * 100n + BigInt((match[2] ?? "").padEnd(2, "0"))
  );
}

export function importType(
  cell: ImportCell | undefined,
): TransactionType | null {
  const value = text(cell)
    .toLowerCase()
    .replace(/[\s_-]/g, "");
  if (value === "paymentin" || value === "in") return "payment_in";
  if (value === "paymentout" || value === "out") return "payment_out";
  return null;
}

export function importMode(cell: ImportCell | undefined): PaymentMode | null {
  const value = text(cell).toLowerCase();
  return value === "cash" ||
    value === "cheque" ||
    value === "online" ||
    value === "upi"
    ? value
    : value === "check"
      ? "cheque"
      : null;
}

export type ImportDeps = {
  db: FinanceDb;
  transactions: TransactionHandlers;
  backdated: (access: MemberAccess) => Promise<BackdatedCheck>;
  /** Live accounts and categories by name, for the sheet's names. */
  names(
    db: Tx,
    workspaceId: string,
  ): Promise<{
    accounts: { id: string; name: string }[];
    categories: { id: string; name: string; disabled: boolean }[];
  }>;
};

function byName<T extends { name: string }>(rows: readonly T[]) {
  return new Map(rows.map((row) => [row.name.trim().toLowerCase(), row]));
}

/**
 * Checks and creates every row in one transaction. Any error anywhere —
 * a cell that cannot be read, or a command refusing the row — rolls back
 * everything: 400 `IMPORT_HAS_ERRORS` with `details.errors`.
 */
export async function importTransactions(
  deps: ImportDeps,
  access: MemberAccess,
  projectId: string,
  rows: readonly TransactionSheetRow[],
): Promise<{ imported: number; importBatchId: string }> {
  assertCan(access, TRANSACTIONS_MENU, "create", { projectId });
  if (rows.length === 0)
    throw new DomainError(
      "IMPORT_EMPTY",
      "The sheet has no rows under its headers.",
    );
  if (rows.length > TRANSACTION_IMPORT_MAX_ROWS)
    throw new DomainError(
      "IMPORT_TOO_MANY",
      `Import at most ${String(TRANSACTION_IMPORT_MAX_ROWS)} rows at a time.`,
    );
  const check = await deps.backdated(access);
  const importBatchId = newId();
  const workspaceId = access.workspaceId;
  await deps.db.$transaction(
    async (tx) => {
      const names = await deps.names(tx, workspaceId);
      const accounts = byName(names.accounts);
      const categories = byName(names.categories);
      const errors: ImportRowError[] = [];
      for (const { row, cells } of rows) {
        const fail = (key: TransactionImportColumnKey, message: string) => {
          errors.push({ row, field: HEADER_OF[key], message });
        };
        const before = errors.length;
        const date = importDate(cells.date);
        if (date == null) fail("date", "Enter the date as DD/MM/YYYY.");
        const type = importType(cells.type);
        if (type == null) fail("type", "Write Payment In or Payment Out.");
        const accountName = text(cells.account).toLowerCase();
        const account = accounts.get(accountName);
        if (account == null)
          fail(
            "account",
            accountName === ""
              ? "Enter the account's name."
              : `No account is named “${text(cells.account)}”.`,
          );
        const mode = importMode(cells.mode);
        if (mode == null) fail("mode", "Write Cash, Cheque, Online or UPI.");
        const categoryName = text(cells.category).toLowerCase();
        const category =
          categoryName === "" ? null : categories.get(categoryName);
        if (category === undefined || category?.disabled === true)
          fail(
            "category",
            `No Payment Category in use is named “${text(cells.category)}”.`,
          );
        const amount = importAmount(cells.amount);
        if (amount == null)
          fail("amount", "Enter the amount in rupees, like 1500.50.");
        if (
          errors.length > before ||
          date == null ||
          type == null ||
          account == null ||
          mode == null ||
          amount == null ||
          category === undefined
        )
          continue;
        const reference = text(cells.reference);
        const input: CreateTransactionInput = {
          projectId,
          transactionDate: date,
          type,
          accountId: account.id,
          paymentCategoryId: category?.id ?? null,
          mode,
          chequeNumber: mode === "cheque" ? reference : null,
          reference: mode === "cheque" ? null : reference,
          counterparty: {
            kind: null,
            id: null,
            name: text(cells.counterparty),
          },
          amount,
          description: text(cells.description),
        };
        try {
          await deps.transactions.createIn(tx, access, input, check, {
            id: newId(),
            importBatchId,
          });
        } catch (error) {
          if (!(error instanceof DomainError)) throw error;
          const details = error.details as { field?: string } | undefined;
          const key = COLUMN_OF_FIELD[details?.field ?? ""];
          errors.push({
            row,
            field: key == null ? "Row" : HEADER_OF[key],
            message:
              error.code === "DUPLICATE_REFERENCE"
                ? error.message.replace(" Save anyway if it is right.", "")
                : error.message,
          });
        }
      }
      if (errors.length > 0)
        throw new DomainError(
          "IMPORT_HAS_ERRORS",
          errors.length === 1
            ? "One row has a problem; nothing was imported."
            : `${String(errors.length)} problems; nothing was imported.`,
          { details: { errors } },
        );
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
  return { imported: rows.length, importBatchId };
}
