import { Prisma } from "@repo/construction-db";

import {
  calendarDateFromDb,
  calendarDateToDb,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { newId } from "@/src/shared-kernel/ids";

import {
  assertAmountFits,
  liveEntries,
  reversalOf,
  type LedgerEntry,
  type LedgerSourceType,
  type NewLedgerEntry,
  type PartyType,
} from "../domain/ledger";

type Tx = Prisma.TransactionClient;

/**
 * A Postgres `bigint` sum as paise. Rows are `integer` paise (one amount is
 * at most ₹21.47 crore); their sums are not, so every money total is read
 * as `SUM(amount)::bigint`, never through Prisma's `_sum` of an Int field.
 */
export function paiseFromBigint(value: bigint | number | null): number {
  const paise = Number(value ?? 0);
  if (!Number.isSafeInteger(paise))
    throw new Error(
      `A money total is beyond ${String(Number.MAX_SAFE_INTEGER)} paise.`,
    );
  return paise;
}

/** Per-party sums of entries, as bigint (see `paiseFromBigint`). */
async function partySums(
  db: Tx,
  workspaceId: string,
  partyType: PartyType,
  partyIds: readonly string[],
  filter: Prisma.Sql,
): Promise<Map<string, number>> {
  if (partyIds.length === 0) return new Map();
  const rows = await db.$queryRaw<{ partyId: string; amount: bigint }[]>(
    Prisma.sql`SELECT party_id::text AS "partyId",
        COALESCE(SUM(amount), 0)::bigint AS "amount"
      FROM construction_labour.ledger_entries
      WHERE workspace_id = ${workspaceId}
        AND party_type = ${partyType}::construction_labour.party_type
        AND party_id = ANY(${[...new Set(partyIds)]}::uuid[])
        AND ${filter}
      GROUP BY party_id`,
  );
  return new Map(rows.map((row) => [row.partyId, paiseFromBigint(row.amount)]));
}

export type StoredLedgerEntry = LedgerEntry & {
  partyType: PartyType;
  partyId: string;
  sourceType: LedgerSourceType;
  sourceId: string;
};

function toEntry(row: {
  id: string;
  partyType: PartyType;
  partyId: string;
  projectId: string | null;
  entryDate: Date;
  kind: LedgerEntry["kind"];
  amount: number;
  sourceType: string;
  sourceId: string;
  reversesEntryId: string | null;
}): StoredLedgerEntry {
  return {
    id: row.id,
    partyType: row.partyType,
    partyId: row.partyId,
    projectId: row.projectId,
    entryDate: calendarDateFromDb(row.entryDate),
    kind: row.kind,
    amount: row.amount,
    sourceType: row.sourceType as LedgerSourceType,
    sourceId: row.sourceId,
    reversesEntryId: row.reversesEntryId,
  };
}

/**
 * The labour context's ledger (ADR CM-0004): entries are only ever
 * inserted, inside the caller's transaction, next to the row that caused
 * them. Zero amounts are skipped.
 */
export const prismaLedger = {
  async post(
    tx: Tx,
    workspaceId: string,
    by: string,
    entries: readonly NewLedgerEntry[],
  ): Promise<void> {
    for (const entry of entries)
      assertAmountFits(
        entry.amount,
        "One amount is at most ₹21,47,48,364. Split it into smaller entries.",
      );
    const rows = entries
      .filter((entry) => entry.amount !== 0)
      .map((entry) => ({
        id: newId(),
        workspaceId,
        partyType: entry.partyType,
        partyId: entry.partyId,
        projectId: entry.projectId,
        entryDate: calendarDateToDb(entry.entryDate),
        kind: entry.kind,
        amount: entry.amount,
        sourceType: entry.sourceType,
        sourceId: entry.sourceId,
        reversesEntryId: entry.reversesEntryId,
        createdBy: by,
      }));
    if (rows.length > 0)
      await tx.constructionLabourLedgerEntry.createMany({ data: rows });
  },

  /** Reverses every live entry a source wrote; returns how many. */
  async reverseSource(
    tx: Tx,
    workspaceId: string,
    by: string,
    sourceType: LedgerSourceType,
    sourceId: string,
  ): Promise<number> {
    const rows = await tx.constructionLabourLedgerEntry.findMany({
      where: { workspaceId, sourceType, sourceId },
    });
    const live = liveEntries(rows.map(toEntry));
    await prismaLedger.post(
      tx,
      workspaceId,
      by,
      live.map((entry) => reversalOf(entry)),
    );
    return live.length;
  },

  /** Every entry of a party up to `to` (inclusive), oldest first. */
  async entriesFor(
    db: Tx,
    workspaceId: string,
    party: { partyType: PartyType; partyId: string },
    to?: CalendarDate,
  ): Promise<StoredLedgerEntry[]> {
    const rows = await db.constructionLabourLedgerEntry.findMany({
      where: {
        workspaceId,
        partyType: party.partyType,
        partyId: party.partyId,
        ...(to == null ? {} : { entryDate: { lte: calendarDateToDb(to) } }),
      },
      orderBy: [{ entryDate: "asc" }, { createdAt: "asc" }],
    });
    return rows.map(toEntry);
  },

  /** Balances (sum of entries up to `on`) for many parties at once. */
  balances(
    db: Tx,
    workspaceId: string,
    partyType: PartyType,
    partyIds: readonly string[],
    on: CalendarDate,
  ): Promise<Map<string, number>> {
    return partySums(
      db,
      workspaceId,
      partyType,
      partyIds,
      Prisma.sql`entry_date <= ${on}::date`,
    );
  },

  /**
   * Net opening balances (the party's own `opening` entries and their
   * reversals) for many parties at once.
   */
  openingBalances(
    db: Tx,
    workspaceId: string,
    partyType: PartyType,
    partyIds: readonly string[],
  ): Promise<Map<string, number>> {
    return partySums(
      db,
      workspaceId,
      partyType,
      partyIds,
      Prisma.sql`kind = 'opening' AND source_type = ${partyType}`,
    );
  },
};
