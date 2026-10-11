import { Prisma } from "@repo/construction-db";

import {
  calendarDateFromDb,
  calendarDateToDb,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { newId } from "@/src/shared-kernel/ids";

import {
  liveEntries,
  reversalOf,
  type NewPartyEntry,
  type PartyEntry,
  type PartyEntrySource,
  type PartyType,
} from "../domain/ledger";

type Tx = Prisma.TransactionClient;

type Row = Prisma.ConstructionFinancePartyEntryGetPayload<object>;

function toEntry(row: Row): PartyEntry {
  return {
    id: row.id,
    partyType: row.partyType,
    partyId: row.partyId,
    projectId: row.projectId,
    storeId: row.storeId,
    entryDate: calendarDateFromDb(row.entryDate),
    kind: row.kind,
    amount: row.amount,
    invoiceId: row.invoiceId,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    reversesEntryId: row.reversesEntryId,
  };
}

/** Where a party balance is kept: a Project, or a Store for a store supplier. */
export type PartyPlace = { projectId: string } | { storeId: string };

/**
 * The party ledger (ADR CM-0017 §7): a Contractor's, Supplier's or Other
 * Party's balance on one Project or Store. + means the Company owes the
 * party. Append-only, inside the caller's transaction; zero amounts are
 * skipped.
 */
export const partyLedger = {
  async post(
    tx: Tx,
    workspaceId: string,
    by: string,
    entries: readonly NewPartyEntry[],
  ): Promise<void> {
    const rows = entries
      .filter((entry) => entry.amount !== 0n)
      .map((entry) => ({
        id: newId(),
        workspaceId,
        partyType: entry.partyType,
        partyId: entry.partyId,
        projectId: entry.projectId,
        storeId: entry.storeId ?? null,
        entryDate: calendarDateToDb(entry.entryDate),
        kind: entry.kind,
        amount: entry.amount,
        invoiceId: entry.invoiceId ?? null,
        sourceType: entry.sourceType,
        sourceId: entry.sourceId,
        reversesEntryId: entry.reversesEntryId ?? null,
        createdBy: by,
      }));
    if (rows.length > 0)
      await tx.constructionFinancePartyEntry.createMany({ data: rows });
  },

  /** Reverses every live entry a source wrote; returns how many. */
  async reverseSource(
    tx: Tx,
    workspaceId: string,
    by: string,
    sourceType: PartyEntrySource,
    sourceId: string,
  ): Promise<number> {
    const rows = await tx.constructionFinancePartyEntry.findMany({
      where: { workspaceId, sourceType, sourceId },
      orderBy: { createdAt: "asc" },
    });
    const live = liveEntries(rows.map(toEntry));
    await partyLedger.post(
      tx,
      workspaceId,
      by,
      live.map((entry) => reversalOf(entry)),
    );
    return live.length;
  },

  /**
   * Balances of parties of one type on a Project or Store, on `on`
   * (inclusive; every entry when null). Parties without entries are 0.
   */
  async balances(
    db: Tx,
    workspaceId: string,
    partyType: PartyType,
    partyIds: readonly string[],
    place: PartyPlace | null,
    on: CalendarDate | null = null,
  ): Promise<Map<string, bigint>> {
    const ids = [...new Set(partyIds)];
    if (ids.length === 0) return new Map();
    const placeFilter =
      place == null
        ? Prisma.sql`TRUE`
        : "projectId" in place
          ? Prisma.sql`project_id = ${place.projectId}::uuid`
          : Prisma.sql`store_id = ${place.storeId}::uuid`;
    const rows = await db.$queryRaw<{ partyId: string; amount: bigint }[]>(
      Prisma.sql`SELECT party_id::text AS "partyId",
          COALESCE(SUM(amount), 0)::bigint AS "amount"
        FROM construction_finance.party_entries
        WHERE workspace_id = ${workspaceId}
          AND party_type = ${partyType}::construction_finance.party_type
          AND party_id = ANY(${ids}::uuid[])
          AND ${placeFilter}
          AND (${on}::date IS NULL OR entry_date <= ${on}::date)
        GROUP BY party_id`,
    );
    const sums = new Map(rows.map((row) => [row.partyId, row.amount]));
    return new Map(ids.map((id) => [id, sums.get(id) ?? 0n]));
  },
};
