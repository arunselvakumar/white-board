import { Prisma, type PrismaClient } from "@repo/construction-db";

import {
  calendarDateFromDb,
  calendarDateToDb,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import type { DomainEvent } from "@/src/shared-kernel/events";
import { newId } from "@/src/shared-kernel/ids";

import {
  NO_STOCK_WATCHER,
  type StockKey,
  type StockLevelWatcher,
} from "../application/ports";
import {
  signedQuantity,
  stockInsufficient,
  type StockPosting,
  type StockShortfall,
  type StockSource,
} from "../domain/stock-ledger";
import { stockLocationKey, type StockLocation } from "../domain/stock-location";

type Tx = Prisma.TransactionClient;
type Reader = Pick<PrismaClient, "$queryRaw"> | Tx;

export type LedgerContext = { workspaceId: string; by: string };

export type LedgerWriteOptions = {
  /** Material names for the `STOCK_INSUFFICIENT` message. */
  materialNames?: ReadonlyMap<string, string>;
};

export type LedgerWriteResult = {
  /** Events to dispatch after the transaction commits. */
  events: DomainEvent[];
};

/**
 * The stock ledger over `construction_procurement.stock_entries` (ADR
 * CM-0015 §3–§5). Every write runs inside the caller's transaction and:
 *
 * 1. takes a transaction-scoped advisory lock per (location, material), in
 *    a fixed order, so two writers to the same stock serialise and two
 *    writers to different stock never wait on each other;
 * 2. appends entries (reversals for the old ones on an edit or delete);
 * 3. refuses (409 `STOCK_INSUFFICIENT`) when the running balance of any
 *    touched material would be below zero on the earliest touched date or
 *    any date after it — so a back-dated consumption cannot empty stock a
 *    later issue already used;
 * 4. asks the `StockLevelWatcher` for minimum-stock crossings.
 *
 * Nothing updates or deletes an entry.
 */
export class PrismaStockLedger {
  constructor(private readonly watcher: StockLevelWatcher = NO_STOCK_WATCHER) {}

  /** Append new movements. */
  async post(
    tx: Tx,
    context: LedgerContext,
    postings: readonly StockPosting[],
    options: LedgerWriteOptions = {},
  ): Promise<LedgerWriteResult> {
    return this.write(tx, context, [], postings, options);
  }

  /** Reverse every live entry a document wrote (delete, reject after dispatch). */
  async reverseSource(
    tx: Tx,
    context: LedgerContext,
    source: StockSource,
    options: LedgerWriteOptions = {},
  ): Promise<LedgerWriteResult> {
    return this.write(tx, context, [source], [], options);
  }

  /**
   * Reverse a document's live entries and post its new ones, checked once
   * together (an edit that lowers a GRN line is fine if stock still covers
   * everything issued after it).
   */
  async replaceSource(
    tx: Tx,
    context: LedgerContext,
    source: StockSource,
    postings: readonly StockPosting[],
    options: LedgerWriteOptions = {},
  ): Promise<LedgerWriteResult> {
    return this.write(tx, context, [source], postings, options);
  }

  /**
   * Stock per material at a location on a date (inclusive; today and after
   * when `on` is omitted), as decimal strings. Materials with no entries are
   * absent (read them as zero).
   */
  async stock(
    db: Reader,
    workspaceId: string,
    location: StockLocation,
    materialIds?: readonly string[],
    on?: CalendarDate,
  ): Promise<Map<string, string>> {
    const rows = await db.$queryRaw<
      { materialId: string; quantity: string }[]
    >(Prisma.sql`
      SELECT material_id::text AS "materialId", SUM(quantity)::text AS quantity
      FROM "construction_procurement"."stock_entries"
      WHERE workspace_id = ${workspaceId}
        AND location_kind = ${location.kind}::"construction_procurement"."location_kind"
        AND location_id = ${location.id}::uuid
        ${materialIds == null ? Prisma.empty : Prisma.sql`AND material_id = ANY(${[...materialIds]}::uuid[])`}
        ${on == null ? Prisma.empty : Prisma.sql`AND entry_date <= ${calendarDateToDb(on)}::date`}
      GROUP BY material_id`);
    return new Map(rows.map((row) => [row.materialId, row.quantity]));
  }

  /** Lock (location, material) pairs for the rest of the transaction. */
  async lock(
    tx: Tx,
    workspaceId: string,
    keys: readonly StockKey[],
  ): Promise<void> {
    const names = [
      ...new Set(
        keys.map(
          (key) =>
            `stock:${workspaceId}:${stockLocationKey(key.location)}:${key.materialId}`,
        ),
      ),
    ].sort();
    for (const name of names)
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${name}, 0))`,
      );
  }

  private async write(
    tx: Tx,
    context: LedgerContext,
    reverse: readonly StockSource[],
    postings: readonly StockPosting[],
    options: LedgerWriteOptions,
  ): Promise<LedgerWriteResult> {
    const { workspaceId, by } = context;
    // One writer per source at a time, whether it posts or reverses: a
    // second edit or delete of the same document waits, then finds the
    // first one's entries (or its reversal) instead of missing an
    // uncommitted post or failing on the unique reversal index.
    const sources = [
      ...new Set(
        [...reverse, ...postings.map((posting) => posting.source)].map(
          (source) => `stock-source:${workspaceId}:${source.type}:${source.id}`,
        ),
      ),
    ].sort();
    for (const name of sources)
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${name}, 0))`,
      );
    const live = [];
    for (const source of reverse)
      live.push(...(await this.liveEntries(tx, workspaceId, source)));

    const touched = new Map<string, { key: StockKey; from: CalendarDate }>();
    const touch = (
      location: StockLocation,
      materialId: string,
      date: CalendarDate,
    ) => {
      const id = `${stockLocationKey(location)}:${materialId}`;
      const seen = touched.get(id);
      if (seen == null)
        touched.set(id, { key: { location, materialId }, from: date });
      else if (date < seen.from) seen.from = date;
    };
    for (const entry of live)
      touch(
        { kind: entry.locationKind, id: entry.locationId },
        entry.materialId,
        calendarDateFromDb(entry.entryDate),
      );
    for (const posting of postings)
      touch(posting.location, posting.materialId, posting.entryDate);
    if (touched.size === 0) return { events: [] };

    const keys = [...touched.values()].map((value) => value.key);
    await this.lock(tx, workspaceId, keys);

    const now = new Date();
    const rows: Prisma.ConstructionProcurementStockEntryCreateManyInput[] = [
      ...live.map((entry) => ({
        id: newId(),
        workspaceId,
        locationKind: entry.locationKind,
        locationId: entry.locationId,
        materialId: entry.materialId,
        entryDate: entry.entryDate,
        type: entry.type,
        quantity: entry.quantity.negated(),
        unitRate: entry.unitRate,
        sourceType: entry.sourceType,
        sourceId: entry.sourceId,
        sourceLineId: entry.sourceLineId,
        counterpartyLabel: entry.counterpartyLabel,
        siteLocationType: entry.siteLocationType,
        siteLocation: entry.siteLocation ?? Prisma.DbNull,
        remark: entry.remark,
        reversesEntryId: entry.id,
        createdAt: now,
        createdBy: by,
      })),
      ...postings.map((posting) => ({
        id: newId(),
        workspaceId,
        locationKind: posting.location.kind,
        locationId: posting.location.id,
        materialId: posting.materialId,
        entryDate: calendarDateToDb(posting.entryDate),
        type: posting.type,
        quantity: new Prisma.Decimal(signedQuantity(posting)),
        unitRate: posting.unitRate ?? null,
        sourceType: posting.source.type,
        sourceId: posting.source.id,
        sourceLineId: posting.sourceLineId ?? null,
        counterpartyLabel: posting.counterpartyLabel ?? null,
        siteLocationType: posting.siteLocation?.type ?? null,
        siteLocation:
          posting.siteLocation == null
            ? Prisma.DbNull
            : (posting.siteLocation as Prisma.InputJsonValue),
        remark: posting.remark ?? null,
        createdAt: now,
        createdBy: by,
      })),
    ];
    await tx.constructionProcurementStockEntry.createMany({ data: rows });

    const shortfalls: StockShortfall[] = [];
    for (const { key, from } of touched.values()) {
      const shortfall = await this.firstShortfall(tx, workspaceId, key, from);
      if (shortfall != null) shortfalls.push(shortfall);
    }
    if (shortfalls.length > 0)
      throw stockInsufficient(shortfalls, options.materialNames);

    return {
      events: await this.watcher.afterStockChanged(tx, workspaceId, keys),
    };
  }

  /** Entries of a source that are not reversals and not yet reversed. */
  private async liveEntries(tx: Tx, workspaceId: string, source: StockSource) {
    const entries = await tx.constructionProcurementStockEntry.findMany({
      where: {
        workspaceId,
        sourceType: source.type,
        sourceId: source.id,
        reversesEntryId: null,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    if (entries.length === 0) return [];
    const reversed = await tx.constructionProcurementStockEntry.findMany({
      where: { reversesEntryId: { in: entries.map((entry) => entry.id) } },
      select: { reversesEntryId: true },
    });
    const done = new Set(reversed.map((row) => row.reversesEntryId));
    return entries.filter((entry) => !done.has(entry.id));
  }

  /**
   * When the running balance is below zero on or after `from`: the first
   * such date, and the largest shortfall from then on (what must be added
   * to fix every later date).
   */
  private async firstShortfall(
    tx: Tx,
    workspaceId: string,
    key: StockKey,
    from: CalendarDate,
  ): Promise<StockShortfall | null> {
    const rows = await tx.$queryRaw<
      { entryDate: Date | null; lowest: string | null }[]
    >(Prisma.sql`
      SELECT MIN(entry_date) AS "entryDate", MIN(running)::text AS lowest
      FROM (
        SELECT entry_date,
               SUM(SUM(quantity)) OVER (ORDER BY entry_date) AS running
        FROM "construction_procurement"."stock_entries"
        WHERE workspace_id = ${workspaceId}
          AND location_kind = ${key.location.kind}::"construction_procurement"."location_kind"
          AND location_id = ${key.location.id}::uuid
          AND material_id = ${key.materialId}::uuid
        GROUP BY entry_date
      ) balances
      WHERE entry_date >= ${calendarDateToDb(from)}::date AND running < 0`);
    const [row] = rows;
    if (row?.entryDate == null || row.lowest == null) return null;
    return {
      location: key.location,
      materialId: key.materialId,
      shortBy: new Prisma.Decimal(row.lowest).negated().toFixed(3),
      onDate: calendarDateFromDb(row.entryDate),
    };
  }
}
