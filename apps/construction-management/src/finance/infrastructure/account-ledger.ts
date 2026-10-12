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
  type AccountEntry,
  type AccountEntrySource,
  type NewAccountEntry,
} from "../domain/ledger";

type Tx = Prisma.TransactionClient;

type Row = Prisma.ConstructionFinanceAccountEntryGetPayload<object>;

function toEntry(row: Row): AccountEntry {
  return {
    id: row.id,
    accountId: row.accountId,
    projectId: row.projectId,
    storeId: row.storeId,
    entryDate: calendarDateFromDb(row.entryDate),
    kind: row.kind,
    amount: row.amount,
    mode: row.mode,
    reference: row.reference,
    paymentCategoryId: row.paymentCategoryId,
    counterpartyKind: row.counterpartyKind,
    counterpartyId: row.counterpartyId,
    counterpartyName: row.counterpartyName,
    documentNumber: row.documentNumber,
    narration: row.narration,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    reversesEntryId: row.reversesEntryId,
  };
}

/**
 * The account ledger (ADR CM-0017 §3): every rupee into (+) or out of (−) a
 * company or petty-cash account. Entries are only ever inserted, inside the
 * caller's transaction, next to the row that caused them. Zero amounts are
 * skipped. Other contexts post through the `AccountPosting` port
 * (`src/composition/account-posting.ts`), which calls this.
 */
export const accountLedger = {
  async post(
    tx: Tx,
    workspaceId: string,
    by: string,
    entries: readonly NewAccountEntry[],
  ): Promise<void> {
    const rows = entries
      .filter((entry) => entry.amount !== 0n)
      .map((entry) => ({
        id: newId(),
        workspaceId,
        accountId: entry.accountId,
        projectId: entry.projectId,
        storeId: entry.storeId ?? null,
        entryDate: calendarDateToDb(entry.entryDate),
        kind: entry.kind,
        amount: entry.amount,
        mode: entry.mode ?? null,
        reference: entry.reference ?? null,
        paymentCategoryId: entry.paymentCategoryId ?? null,
        counterpartyKind: entry.counterpartyKind ?? null,
        counterpartyId: entry.counterpartyId ?? null,
        counterpartyName: entry.counterpartyName ?? null,
        documentNumber: entry.documentNumber ?? null,
        narration: entry.narration ?? null,
        sourceType: entry.sourceType,
        sourceId: entry.sourceId,
        reversesEntryId: entry.reversesEntryId ?? null,
        createdBy: by,
      }));
    if (rows.length > 0)
      await tx.constructionFinanceAccountEntry.createMany({ data: rows });
  },

  /** Reverses every live entry a source wrote; returns how many. */
  async reverseSource(
    tx: Tx,
    workspaceId: string,
    by: string,
    sourceType: AccountEntrySource,
    sourceId: string,
  ): Promise<number> {
    const rows = await tx.constructionFinanceAccountEntry.findMany({
      where: { workspaceId, sourceType, sourceId },
      orderBy: { createdAt: "asc" },
    });
    const live = liveEntries(rows.map(toEntry));
    await accountLedger.post(
      tx,
      workspaceId,
      by,
      live.map((entry) => reversalOf(entry)),
    );
    return live.length;
  },

  /** The live entries a source wrote (reversed ones left out). */
  async liveFor(
    tx: Tx,
    workspaceId: string,
    sourceType: AccountEntrySource,
    sourceId: string,
  ): Promise<AccountEntry[]> {
    const rows = await tx.constructionFinanceAccountEntry.findMany({
      where: { workspaceId, sourceType, sourceId },
      orderBy: { createdAt: "asc" },
    });
    return liveEntries(rows.map(toEntry));
  },

  /**
   * Balances of accounts on `on` (inclusive; every entry when null), as
   * `SUM(amount)::bigint`. Accounts without entries are 0.
   */
  async balances(
    db: Tx,
    workspaceId: string,
    accountIds: readonly string[],
    on: CalendarDate | null = null,
  ): Promise<Map<string, bigint>> {
    const ids = [...new Set(accountIds)];
    if (ids.length === 0) return new Map();
    const rows = await db.$queryRaw<{ accountId: string; amount: bigint }[]>(
      Prisma.sql`SELECT account_id::text AS "accountId",
          COALESCE(SUM(amount), 0)::bigint AS "amount"
        FROM construction_finance.account_entries
        WHERE workspace_id = ${workspaceId}
          AND account_id = ANY(${ids}::uuid[])
          AND (${on}::date IS NULL OR entry_date <= ${on}::date)
        GROUP BY account_id`,
    );
    const sums = new Map(rows.map((row) => [row.accountId, row.amount]));
    return new Map(ids.map((id) => [id, sums.get(id) ?? 0n]));
  },
};

/** Locks an account row for the rest of the transaction (`FOR SHARE`). */
export async function lockAccountForShare(
  tx: Tx,
  workspaceId: string,
  accountId: string,
): Promise<{ id: string; kind: string; holderMemberId: string | null } | null> {
  const rows = await tx.$queryRaw<
    { id: string; kind: string; holderMemberId: string | null }[]
  >(
    Prisma.sql`SELECT id::text AS id, kind::text AS kind,
        holder_member_id::text AS "holderMemberId"
      FROM construction_finance.accounts
      WHERE id = ${accountId}::uuid AND workspace_id = ${workspaceId}
        AND deleted_at IS NULL
      FOR SHARE`,
  );
  return rows[0] ?? null;
}
