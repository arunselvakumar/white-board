import {
  assertCan,
  can,
  menuByKey,
  type Flag,
  type MemberAccess,
} from "@/src/shared-kernel/access";
import { fromMask } from "@/src/shared-kernel/access/flags";
import { recordAudit, recordAudits } from "@/src/shared-kernel/audit";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";

import {
  indexText,
  monthLabel,
  monthStart,
  PRICE_INDEX_SERIES_SUGGESTIONS,
  priceIndexChanged,
  priceIndexMonth,
  priceIndexNotFound,
  priceIndexValue,
  sameSeries,
  seriesName,
} from "../domain/escalation";
import {
  PRICE_INDEX_MENU,
  type PriceIndexStore,
  type StoredPriceIndex,
} from "./escalation-ports";
import type { BoqDb } from "./boq-ports";

/**
 * Price indices (CM-1109, ADR CM-0023 §9): a Company-level table of
 * series × month × value that the accountant types or imports. We never
 * fetch them. They sit under Master records → Contracts beside the Item
 * Library and use its menu (`contracts.items`): Read lists, Create adds,
 * Update edits a value, Delete removes, Import and Export move the sheet.
 * Series names match ignoring case, so a new index joins the series
 * already kept under its first spelling.
 */

export const PRICE_INDEX_LIST_MAX = 10_000;
export const PRICE_INDEX_IMPORT_ROWS_MAX = 2000;

export const PRICE_INDEX_COLUMNS = [
  { key: "series", header: "Series", width: 28 },
  { key: "month", header: "Month", width: 12 },
  { key: "value", header: "Value", width: 12 },
] as const;
export type PriceIndexColumnKey = (typeof PRICE_INDEX_COLUMNS)[number]["key"];
export type PriceIndexCell = string | number | Date | null;
export type PriceIndexSheetRow = {
  row: number;
  cells: Partial<Record<PriceIndexColumnKey, PriceIndexCell>>;
};

export type PriceIndexSeries = {
  name: string;
  /** Month order. */
  indices: StoredPriceIndex[];
};

export type PriceIndexList = {
  series: PriceIndexSeries[];
  suggestions: string[];
  viewerFlags: Flag[];
};

export type PriceIndexDeps = {
  db: BoqDb;
  store: PriceIndexStore;
  clock?: () => Date;
};

const MONTH_WORDS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

/**
 * A month in a sheet cell: an Excel date (any day of the month), or text
 * `2026-04`, `2026-04-01`, `Apr 2026`, `April-2026`.
 */
export function sheetMonth(cell: PriceIndexCell | undefined): string | null {
  if (cell == null) return null;
  if (cell instanceof Date)
    return Number.isNaN(cell.getTime())
      ? null
      : `${cell.toISOString().slice(0, 7)}-01`;
  const text = String(cell).trim();
  const direct = monthStart(text);
  if (direct != null) return direct;
  const named = /^([A-Za-z]{3,9})[\s\-/]+(\d{4})$/.exec(text);
  if (named == null) return null;
  const index = MONTH_WORDS.indexOf((named[1] ?? "").slice(0, 3).toLowerCase());
  if (index < 0) return null;
  return monthStart(`${named[2] ?? ""}-${String(index + 1).padStart(2, "0")}`);
}

function audit(
  access: MemberAccess,
  action: string,
  row: StoredPriceIndex,
  change: { before?: unknown; after?: unknown },
  at: Date,
) {
  return {
    workspaceId: access.workspaceId,
    actorUserId: access.userId,
    action,
    entityType: "price_index",
    entityId: row.id,
    ...change,
    occurredAt: at,
  };
}

const snapshot = (row: StoredPriceIndex) => ({
  series: row.series,
  month: row.month,
  value: indexText(row.value),
});

export class PriceIndexHandlers {
  private readonly clock: () => Date;

  constructor(private readonly deps: PriceIndexDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  viewerFlags(access: MemberAccess): Flag[] {
    const supported = fromMask(menuByKey(PRICE_INDEX_MENU)?.supported ?? 0);
    return supported.filter((flag) => can(access, PRICE_INDEX_MENU, flag));
  }

  /** Every series with its months (Read), and the series to suggest. */
  async list(access: MemberAccess): Promise<PriceIndexList> {
    assertCan(access, PRICE_INDEX_MENU, "read");
    const rows = await this.deps.store.list(
      this.deps.db,
      access.workspaceId,
      PRICE_INDEX_LIST_MAX,
    );
    const series = new Map<string, PriceIndexSeries>();
    for (const row of rows) {
      const key = row.series.toLocaleLowerCase("en-IN");
      const found = series.get(key) ?? { name: row.series, indices: [] };
      found.indices.push(row);
      series.set(key, found);
    }
    const kept = [...series.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    return {
      series: kept,
      suggestions: [
        ...PRICE_INDEX_SERIES_SUGGESTIONS.filter(
          (name) => !kept.some((row) => sameSeries(row.name, name)),
        ),
      ],
      viewerFlags: this.viewerFlags(access),
    };
  }

  /** Every index, by series then month (Export). */
  async export(access: MemberAccess): Promise<StoredPriceIndex[]> {
    assertCan(access, PRICE_INDEX_MENU, "export");
    return this.deps.store.list(
      this.deps.db,
      access.workspaceId,
      PRICE_INDEX_LIST_MAX,
    );
  }

  async find(workspaceId: string, id: string): Promise<StoredPriceIndex> {
    const found = await this.deps.store.find(this.deps.db, workspaceId, id);
    if (found == null) throw priceIndexNotFound();
    return found;
  }

  /** The series' spelling already kept, or the one typed. */
  private async canonical(
    db: Parameters<PriceIndexStore["seriesNames"]>[0],
    workspaceId: string,
    name: string,
  ): Promise<string> {
    const names = await this.deps.store.seriesNames(db, workspaceId);
    return names.find((kept) => sameSeries(kept, name)) ?? name;
  }

  /** Adds one month of a series (Create; 409 `PRICE_INDEX_EXISTS`). */
  async create(
    access: MemberAccess,
    input: { series: string; month: string; value: string | number },
  ): Promise<StoredPriceIndex> {
    assertCan(access, PRICE_INDEX_MENU, "create");
    const typed = seriesName(input.series);
    const month = priceIndexMonth(input.month);
    const value = priceIndexValue(input.value);
    const at = this.clock();
    return this.deps.db.$transaction(async (tx) => {
      const row: StoredPriceIndex = {
        id: newId(at.getTime()),
        workspaceId: access.workspaceId,
        series: await this.canonical(tx, access.workspaceId, typed),
        month,
        value,
        createdAt: at,
        updatedAt: at,
        createdBy: access.userId,
        updatedBy: access.userId,
      };
      await this.deps.store.insert(tx, row);
      await recordAudit(
        tx,
        audit(access, "price_index.created", row, { after: snapshot(row) }, at),
      );
      return row;
    });
  }

  /** Changes a month's value (Update; 409 `PRICE_INDEX_CHANGED` when stale). */
  async update(
    access: MemberAccess,
    id: string,
    input: { value: string | number; expectedUpdatedAt?: Date | null },
  ): Promise<StoredPriceIndex> {
    assertCan(access, PRICE_INDEX_MENU, "update");
    const before = await this.find(access.workspaceId, id);
    const value = priceIndexValue(input.value);
    const at = this.clock();
    return this.deps.db.$transaction(async (tx) => {
      const after: StoredPriceIndex = {
        ...before,
        value,
        updatedAt: at,
        updatedBy: access.userId,
      };
      if (
        !(await this.deps.store.update(
          tx,
          after,
          input.expectedUpdatedAt ?? null,
        ))
      )
        throw priceIndexChanged();
      await recordAudit(
        tx,
        audit(
          access,
          "price_index.updated",
          after,
          { before: snapshot(before), after: snapshot(after) },
          at,
        ),
      );
      return after;
    });
  }

  /**
   * Removes a month (Delete). Approved escalation bills keep the working
   * they were approved with; a draft that needs the month is refused
   * when next worked out (400 `PRICE_INDEX_MISSING`).
   */
  async delete(access: MemberAccess, id: string): Promise<void> {
    assertCan(access, PRICE_INDEX_MENU, "delete");
    const before = await this.find(access.workspaceId, id);
    const at = this.clock();
    await this.deps.db.$transaction(async (tx) => {
      if (!(await this.deps.store.delete(tx, access.workspaceId, id)))
        throw priceIndexNotFound();
      await recordAudit(
        tx,
        audit(
          access,
          "price_index.deleted",
          before,
          { before: snapshot(before) },
          at,
        ),
      );
    });
  }

  /**
   * Imports Series, Month and Value rows (Import): a new (series, month)
   * is added, an existing one has its value replaced, the same value is
   * `unchanged`. All or nothing: 400 `IMPORT_HAS_ERRORS` with
   * `details.errors` = [{ row, column, message }]; `IMPORT_EMPTY`.
   */
  async importSheet(
    access: MemberAccess,
    rows: readonly PriceIndexSheetRow[],
  ): Promise<{ created: number; updated: number; unchanged: number }> {
    assertCan(access, PRICE_INDEX_MENU, "import");
    if (rows.length === 0)
      throw new DomainError(
        "IMPORT_EMPTY",
        "The sheet has no rows under the headers.",
      );
    const errors: { row: number; column: string; message: string }[] = [];
    const fail = (row: number, column: PriceIndexColumnKey, error: unknown) =>
      errors.push({
        row,
        column:
          PRICE_INDEX_COLUMNS.find((item) => item.key === column)?.header ??
          column,
        message: error instanceof Error ? error.message : String(error),
      });
    const parsed: {
      row: number;
      series: string;
      month: CalendarDate;
      value: bigint;
    }[] = [];
    const firstRow = new Map<string, number>();
    for (const { row, cells } of rows) {
      let series: string | null = null;
      let month: CalendarDate | null = null;
      let value: bigint | null = null;
      try {
        series = seriesName(cells.series == null ? "" : String(cells.series));
      } catch (error) {
        fail(row, "series", error);
      }
      month = sheetMonth(cells.month);
      if (month == null)
        fail(
          row,
          "month",
          new Error("Enter the month as YYYY-MM, Apr 2026 or a date."),
        );
      try {
        const raw = cells.value;
        value = priceIndexValue(
          raw instanceof Date || raw == null ? null : raw,
        );
      } catch (error) {
        fail(row, "value", error);
      }
      if (series == null || month == null || value == null) continue;
      const key = `${series.toLocaleLowerCase("en-IN")}|${month}`;
      const first = firstRow.get(key);
      if (first != null) {
        fail(
          row,
          "month",
          new Error(
            `${series} for ${monthLabel(month)} is already on row ${String(first)}.`,
          ),
        );
        continue;
      }
      firstRow.set(key, row);
      parsed.push({ row, series, month, value });
    }
    if (errors.length > 0)
      throw new DomainError(
        "IMPORT_HAS_ERRORS",
        `The sheet has ${String(errors.length)} ${errors.length === 1 ? "problem" : "problems"}. Fix them and upload it again; nothing was saved.`,
        { details: { errors } },
      );
    const at = this.clock();
    const ws = access.workspaceId;
    return this.deps.db.$transaction(async (tx) => {
      const kept = await this.deps.store.inMonths(tx, ws, [
        ...new Set(parsed.map((row) => row.month)),
      ]);
      const names = await this.deps.store.seriesNames(tx, ws);
      const spelling = new Map<string, string>();
      for (const name of names)
        spelling.set(name.toLocaleLowerCase("en-IN"), name);
      const added: StoredPriceIndex[] = [];
      const events = [];
      let updated = 0;
      let unchanged = 0;
      for (const row of parsed) {
        const key = row.series.toLocaleLowerCase("en-IN");
        const name = spelling.get(key) ?? row.series;
        spelling.set(key, name);
        const existing = kept.find(
          (item) => item.month === row.month && sameSeries(item.series, name),
        );
        if (existing == null) {
          const created: StoredPriceIndex = {
            id: newId(at.getTime()),
            workspaceId: ws,
            series: name,
            month: row.month,
            value: row.value,
            createdAt: at,
            updatedAt: at,
            createdBy: access.userId,
            updatedBy: access.userId,
          };
          added.push(created);
          events.push(
            audit(
              access,
              "price_index.created",
              created,
              { after: { ...snapshot(created), source: "import" } },
              at,
            ),
          );
          continue;
        }
        if (existing.value === row.value) {
          unchanged += 1;
          continue;
        }
        const after = {
          ...existing,
          value: row.value,
          updatedAt: at,
          updatedBy: access.userId,
        };
        await this.deps.store.update(tx, after, null);
        updated += 1;
        events.push(
          audit(
            access,
            "price_index.updated",
            after,
            {
              before: snapshot(existing),
              after: { ...snapshot(after), source: "import" },
            },
            at,
          ),
        );
      }
      await this.deps.store.insertMany(tx, added);
      await recordAudits(tx, events);
      return { created: added.length, updated, unchanged };
    });
  }
}
