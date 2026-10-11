import { Prisma } from "@repo/construction-db";

import {
  calendarDateFromDb,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";

import type { FinanceDirectory } from "../application/ports";
import type {
  AccountEntryKind,
  AccountEntrySource,
  AccountKind,
  CounterpartyKind,
  PaymentMode,
} from "../domain/ledger";

type Db = Prisma.TransactionClient;

export type AccountStatementFilters = {
  from: CalendarDate;
  to: CalendarDate;
  sourceType?: AccountEntrySource;
  paymentCategoryId?: string;
  mode?: PaymentMode;
  counterpartyKind?: CounterpartyKind;
};

export type AccountStatementAccount = {
  id: string;
  name: string;
  kind: AccountKind;
  /** Petty cash only. */
  holderName: string | null;
};

export type AccountStatementLine = {
  id: string;
  entryDate: CalendarDate;
  kind: AccountEntryKind;
  /** Paise, signed: + in, − out. */
  amount: bigint;
  /** The balance after this line. */
  balance: bigint;
  sourceType: AccountEntrySource;
  sourceId: string;
  documentNumber: string | null;
  counterpartyName: string | null;
  mode: PaymentMode | null;
  reference: string | null;
  paymentCategoryName: string | null;
  projectName: string | null;
  narration: string | null;
  isReversal: boolean;
};

export type AccountStatement = {
  account: AccountStatementAccount;
  from: CalendarDate;
  to: CalendarDate;
  /** The sum of matching entries before `from`. */
  opening: bigint;
  entries: AccountStatementLine[];
  /** Money in (positive lines) and out (negative lines, as a positive sum). */
  totalIn: bigint;
  totalOut: bigint;
  closing: bigint;
};

/** A live account of the Company with its holder's user (for the access rule). */
export async function statementAccount(
  db: Db,
  directory: Pick<FinanceDirectory, "teamMembers">,
  workspaceId: string,
  accountId: string,
): Promise<(AccountStatementAccount & { holderUserId: string | null }) | null> {
  const row = await db.constructionFinanceAccount.findFirst({
    where: { id: accountId, workspaceId, deletedAt: null },
    select: { id: true, name: true, kind: true, holderMemberId: true },
  });
  if (row == null) return null;
  const holder =
    row.holderMemberId == null
      ? null
      : ((
          await directory.teamMembers(db, workspaceId, [row.holderMemberId])
        ).get(row.holderMemberId) ?? null);
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    holderName: holder?.name ?? null,
    holderUserId: holder?.userId ?? null,
  };
}

function filterSql(filters: AccountStatementFilters): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  if (filters.sourceType != null)
    parts.push(
      Prisma.sql`AND source_type = ${filters.sourceType}::construction_finance.account_entry_source`,
    );
  if (filters.paymentCategoryId != null)
    parts.push(
      Prisma.sql`AND payment_category_id = ${filters.paymentCategoryId}::uuid`,
    );
  if (filters.mode != null)
    parts.push(
      Prisma.sql`AND mode = ${filters.mode}::construction_finance.payment_mode`,
    );
  if (filters.counterpartyKind != null)
    parts.push(
      Prisma.sql`AND counterparty_kind = ${filters.counterpartyKind}::construction_finance.counterparty_kind`,
    );
  return parts.length === 0 ? Prisma.empty : Prisma.join(parts, " ");
}

/**
 * An account's statement for a period (the Ledger, CM-0017 §16): the
 * opening (matching entries before `from`), every matching entry in the
 * period with its running balance, money in and out, and the closing. The
 * filters apply to the opening as well, so closing = opening + in − out
 * always holds. Reversals are lines of their own.
 */
export async function accountStatement(
  db: Db,
  directory: Pick<FinanceDirectory, "projects" | "stores">,
  workspaceId: string,
  account: AccountStatementAccount,
  filters: AccountStatementFilters,
): Promise<AccountStatement> {
  const where = filterSql(filters);
  const [openingRows, rows] = await Promise.all([
    db.$queryRaw<{ amount: bigint }[]>(
      Prisma.sql`SELECT COALESCE(SUM(amount), 0)::bigint AS amount
        FROM construction_finance.account_entries
        WHERE workspace_id = ${workspaceId} AND account_id = ${account.id}::uuid
          AND entry_date < ${filters.from}::date ${where}`,
    ),
    db.$queryRaw<
      {
        id: string;
        entryDate: Date;
        kind: AccountEntryKind;
        amount: bigint;
        sourceType: AccountEntrySource;
        sourceId: string;
        documentNumber: string | null;
        counterpartyName: string | null;
        mode: PaymentMode | null;
        reference: string | null;
        paymentCategoryName: string | null;
        projectId: string | null;
        storeId: string | null;
        narration: string | null;
        reversesEntryId: string | null;
      }[]
    >(
      Prisma.sql`SELECT e.id::text AS id, e.entry_date AS "entryDate",
          e.kind::text AS kind, e.amount, e.source_type::text AS "sourceType",
          e.source_id::text AS "sourceId", e.document_number AS "documentNumber",
          e.counterparty_name AS "counterpartyName", e.mode::text AS mode,
          e.reference, c.name AS "paymentCategoryName",
          e.project_id::text AS "projectId", e.store_id::text AS "storeId",
          e.narration, e.reverses_entry_id::text AS "reversesEntryId"
        FROM (
          SELECT * FROM construction_finance.account_entries
          WHERE workspace_id = ${workspaceId} AND account_id = ${account.id}::uuid
            AND entry_date BETWEEN ${filters.from}::date AND ${filters.to}::date ${where}
        ) AS e
        LEFT JOIN construction_finance.payment_categories c ON c.id = e.payment_category_id
        ORDER BY e.entry_date, e.created_at, e.id`,
    ),
  ]);
  const projectIds = new Set<string>();
  const storeIds = new Set<string>();
  for (const row of rows) {
    if (row.projectId != null) projectIds.add(row.projectId);
    if (row.storeId != null) storeIds.add(row.storeId);
  }
  const [projects, stores] = await Promise.all([
    directory.projects(db, workspaceId, [...projectIds]),
    directory.stores(db, workspaceId, [...storeIds]),
  ]);
  const opening = openingRows[0]?.amount ?? 0n;
  let balance = opening;
  let totalIn = 0n;
  let totalOut = 0n;
  const entries = rows.map((row): AccountStatementLine => {
    balance += row.amount;
    if (row.amount > 0n) totalIn += row.amount;
    else totalOut -= row.amount;
    return {
      id: row.id,
      entryDate: calendarDateFromDb(row.entryDate),
      kind: row.kind,
      amount: row.amount,
      balance,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      documentNumber: row.documentNumber,
      counterpartyName: row.counterpartyName,
      mode: row.mode,
      reference: row.reference,
      paymentCategoryName: row.paymentCategoryName,
      projectName:
        row.projectId != null
          ? (projects.get(row.projectId)?.name ?? null)
          : row.storeId != null
            ? (stores.get(row.storeId)?.name ?? null)
            : null,
      narration: row.narration,
      isReversal: row.reversesEntryId != null,
    };
  });
  return {
    account,
    from: filters.from,
    to: filters.to,
    opening,
    entries,
    totalIn,
    totalOut,
    closing: balance,
  };
}
