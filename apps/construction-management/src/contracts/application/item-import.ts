import type { MemberAccess } from "@/src/shared-kernel/access";
import { DomainError } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";

import { itemFields, type ItemFields } from "../domain/item";
import { scaledDecimal } from "../domain/item-analysis";
import type { ItemDeps, ItemSummary, StoredItem } from "./item-handlers";

/**
 * Item import (CM-1102, ADR CM-0023 §3): the Company's own schedule from
 * Excel. Rows are matched to the library by Code ignoring case: a new code
 * adds an Item, an existing one has its fields replaced (its rate analysis
 * is never touched, and rate analysis is not imported). The UoM is matched
 * by name ignoring case. All rows or none; at most 2,000.
 */

export const ITEM_IMPORT_COLUMNS = [
  { key: "code", header: "Code", width: 14 },
  { key: "shortDescription", header: "Short description", width: 40 },
  { key: "description", header: "Description", width: 60 },
  { key: "uom", header: "UoM", width: 10 },
  { key: "sacHsn", header: "SAC/HSN", width: 11 },
  { key: "schedule", header: "Schedule", width: 22 },
  { key: "rate", header: "Rate (₹)", width: 14 },
] as const;

export type ItemImportColumnKey = (typeof ITEM_IMPORT_COLUMNS)[number]["key"];

export const ITEM_IMPORT_ROWS_MAX = 2000;

export type ItemImportCell = string | number | Date | null;

export type ItemSheetRow = {
  /** The row number in the sheet (the header is row 1). */
  row: number;
  cells: Partial<Record<ItemImportColumnKey, ItemImportCell>>;
};

export type ItemImportRowError = {
  row: number;
  /** The column's header, as the sample prints it. */
  column: string;
  message: string;
};

export type ItemImportResult = {
  created: number;
  updated: number;
  /** Rows whose Item already had exactly these fields. */
  unchanged: number;
};

const HEADER_OF = Object.fromEntries(
  ITEM_IMPORT_COLUMNS.map((column) => [column.key, column.header]),
) as Record<ItemImportColumnKey, string>;

/** Domain fields (`details.field`) to the sheet's columns. */
const COLUMN_OF_FIELD: Record<string, ItemImportColumnKey> = {
  code: "code",
  shortDescription: "shortDescription",
  description: "description",
  uomId: "uom",
  sacHsn: "sacHsn",
  schedule: "schedule",
  adoptedRate: "rate",
};

function text(cell: ItemImportCell | undefined): string {
  if (cell == null) return "";
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  return String(cell).trim();
}

const key = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Rupees in a cell as paise: a number cell, or text like `6,123.45` or
 * `₹ 6123.45`; at most two decimals. Null when it is not an amount.
 */
export function sheetRupees(cell: ItemImportCell | undefined): bigint | null {
  if (typeof cell === "number") {
    if (!Number.isFinite(cell)) return null;
    const paise = Math.round(cell * 100);
    // An Excel number is binary: 6123.45 is 612344.99…, so allow that slip.
    if (Math.abs(cell * 100 - paise) > 1e-6) return null;
    return BigInt(paise);
  }
  const value = text(cell)
    .replace(/^₹\s*/, "")
    .replace(/^rs\.?\s*/i, "");
  if (value === "") return null;
  return scaledDecimal(value, 2);
}

function rowsError(errors: ItemImportRowError[]): DomainError {
  const order: string[] = ITEM_IMPORT_COLUMNS.map((column) => column.header);
  const sorted = [...errors].sort(
    (a, b) =>
      a.row - b.row || order.indexOf(a.column) - order.indexOf(b.column),
  );
  return new DomainError(
    "IMPORT_HAS_ERRORS",
    `The sheet has ${String(errors.length)} ${errors.length === 1 ? "problem" : "problems"}. Fix them and upload it again; nothing was saved.`,
    { details: { errors: sorted } },
  );
}

function sameFields(a: ItemFields, b: ItemFields): boolean {
  return (
    a.code === b.code &&
    a.shortDescription === b.shortDescription &&
    a.description === b.description &&
    a.uomId === b.uomId &&
    a.sacHsn === b.sacHsn &&
    a.schedule === b.schedule &&
    a.adoptedRate === b.adoptedRate
  );
}

/**
 * Checks every row, then adds and updates them in one transaction. Any
 * problem saves nothing: 400 `IMPORT_HAS_ERRORS` with `details.errors` =
 * [{ row, column, message }]; 400 `IMPORT_EMPTY`, `IMPORT_TOO_MANY`. A code
 * twice in the sheet is a row error. A blank optional cell clears it on an
 * existing Item.
 */
export async function importItems(
  deps: ItemDeps,
  access: MemberAccess,
  rows: readonly ItemSheetRow[],
  now: Date,
): Promise<ItemImportResult> {
  if (rows.length === 0)
    throw new DomainError(
      "IMPORT_EMPTY",
      "The sheet has no rows under its headers.",
    );
  if (rows.length > ITEM_IMPORT_ROWS_MAX)
    throw new DomainError(
      "IMPORT_TOO_MANY",
      `Import at most ${ITEM_IMPORT_ROWS_MAX.toLocaleString("en-IN")} rows at a time.`,
    );
  const ws = access.workspaceId;
  const codes = rows
    .map(({ cells }) => text(cells.code))
    .filter((code) => code !== "");
  const [uomOptions, existing] = await Promise.all([
    deps.directory.uomOptions(deps.db, ws),
    deps.store.byCodes(ws, codes),
  ]);
  // An existing Item may keep a UoM that was disabled since.
  const keptUoms = await deps.directory.uoms(
    deps.db,
    ws,
    existing.map((item) => item.uomId),
  );
  const uomsByName = new Map<string, string[]>();
  for (const uom of uomOptions)
    uomsByName.set(key(uom.name), [
      ...(uomsByName.get(key(uom.name)) ?? []),
      uom.id,
    ]);
  const existingByCode = new Map(
    existing.map((item) => [key(item.code), item]),
  );

  const errors: ItemImportRowError[] = [];
  const seen = new Map<string, number>();
  const creates: StoredItem[] = [];
  const updates: { before: ItemSummary; after: ItemSummary }[] = [];
  let unchanged = 0;
  const at = now.getTime();

  for (const { row, cells } of rows) {
    const fail = (column: ItemImportColumnKey, message: string) => {
      errors.push({ row, column: HEADER_OF[column], message });
    };
    const before = errors.length;
    const code = text(cells.code);
    const codeKey = key(code);
    if (code !== "") {
      const first = seen.get(codeKey);
      if (first != null)
        fail("code", `This code is also on row ${String(first)}.`);
      else seen.set(codeKey, row);
    }
    const current = existingByCode.get(codeKey);

    let uomId = "";
    const uomWord = text(cells.uom);
    if (uomWord === "") fail("uom", "Write the UoM, like cum or sqm.");
    else {
      const found = uomsByName.get(key(uomWord)) ?? [];
      const kept =
        current != null &&
        key(keptUoms.get(current.uomId)?.name ?? "") === key(uomWord);
      if (kept) uomId = current.uomId;
      else if (found.length === 1) uomId = found[0] ?? "";
      else if (found.length > 1)
        fail("uom", `More than one Measurement Unit is named “${uomWord}”.`);
      else
        fail(
          "uom",
          `No Measurement Unit is named “${uomWord}”. Add it in Master records → Measurement Units, or use one of yours.`,
        );
    }

    let rate: bigint | null = null;
    if (text(cells.rate) === "") fail("rate", "Write the rate in rupees.");
    else {
      rate = sheetRupees(cells.rate);
      if (rate == null) fail("rate", "Write the rate in rupees, like 6123.45.");
    }

    // Checked even when the UoM or rate failed, so every column reports;
    // the stand-ins are never saved.
    let fields: ItemFields | null = null;
    try {
      fields = itemFields({
        code,
        shortDescription: text(cells.shortDescription),
        description: text(cells.description),
        uomId: uomId === "" ? "-" : uomId,
        sacHsn: text(cells.sacHsn),
        schedule: text(cells.schedule),
        adoptedRate: rate ?? 0n,
      });
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      const field = (error.details as { field?: string } | undefined)?.field;
      fail(COLUMN_OF_FIELD[field ?? ""] ?? "code", error.message);
    }
    if (fields == null || errors.length > before) continue;

    if (current == null) {
      creates.push({
        ...fields,
        id: newId(at),
        workspaceId: ws,
        overheadPercent: null,
        analysedRate: null,
        lineCount: 0,
        lines: [],
        createdAt: now,
        updatedAt: now,
        createdBy: access.userId,
        updatedBy: access.userId,
      });
    } else if (sameFields(current, fields)) {
      unchanged += 1;
    } else {
      updates.push({
        before: current,
        after: {
          ...current,
          ...fields,
          updatedAt: now,
          updatedBy: access.userId,
        },
      });
    }
  }
  if (errors.length > 0) throw rowsError(errors);

  await deps.store.importRows({
    workspaceId: ws,
    by: access.userId,
    now,
    creates,
    updates,
  });
  return { created: creates.length, updated: updates.length, unchanged };
}
