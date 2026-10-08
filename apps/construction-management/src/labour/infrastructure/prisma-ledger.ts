import type { Prisma } from "@repo/db";

import {
  calendarDateFromDb,
  calendarDateToDb,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { newId } from "@/src/shared-kernel/ids";

import {
  liveEntries,
  reversalOf,
  type LedgerEntry,
  type LedgerSourceType,
  type NewLedgerEntry,
  type PartyType,
} from "../domain/ledger";

type Tx = Prisma.TransactionClient;

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
  async balances(
    db: Tx,
    workspaceId: string,
    partyType: PartyType,
    partyIds: readonly string[],
    on: CalendarDate,
  ): Promise<Map<string, number>> {
    if (partyIds.length === 0) return new Map();
    const sums = await db.constructionLabourLedgerEntry.groupBy({
      by: ["partyId"],
      where: {
        workspaceId,
        partyType,
        partyId: { in: [...new Set(partyIds)] },
        entryDate: { lte: calendarDateToDb(on) },
      },
      _sum: { amount: true },
    });
    return new Map(sums.map((row) => [row.partyId, row._sum.amount ?? 0]));
  },
};
