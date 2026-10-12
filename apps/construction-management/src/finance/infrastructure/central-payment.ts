import { Prisma, type PrismaClient } from "@repo/construction-db";

import type { CalendarDate } from "@/src/shared-kernel/calendar-date";

import type { FinanceDirectory } from "../application/ports";
import { partyDues } from "../domain/dues";
import type { PartyType } from "../domain/ledger";
import { accountLedger } from "./account-ledger";
import {
  loadDueInvoices,
  nameOfParty,
  partyKey,
  partyNames,
} from "./due-invoices";

export type CentralPartyDue = {
  partyType: PartyType;
  partyId: string;
  name: string;
  /** Projects (in scope) with this party's invoices, payments or entries. */
  projectCount: number;
  /** Bills from the party. */
  invoiced: bigint;
  /** Allocated to those bills (money and TDS) plus written off. */
  paid: bigint;
  due: bigint;
  overdue: bigint;
  /** Settled amount of payments out not yet allocated to a bill. */
  advance: bigint;
  /** What is left on bills to the party (Other Parties' sales invoices). */
  receivable: bigint;
  /** Σ party entries: + the Company owes the party. */
  balance: bigint;
};

export type CentralCompanyAccount = {
  id: string;
  name: string;
  kind: "cash" | "bank";
  isPrimary: boolean;
  bankName: string | null;
  /** The account number's last four characters. */
  accountLast4: string | null;
  /** Approved entries up to today. */
  balance: bigint;
  /** What pending Transactions, transfers, vouchers and Other Expenses would add (+) or take (−). */
  pendingTotal: bigint;
  pendingCount: number;
};

type Scope = {
  /** Null: every Project and Store (the Owner). */
  projectIds: readonly string[] | null;
};

/**
 * Central Payment in the Workspace (CM-709, ADR CM-0017 §14, §16): each
 * Contractor's, Supplier's and Other Party's dues across the Projects in
 * scope, and every company account's balance with what is pending.
 */
export class CentralPayment {
  constructor(
    private readonly db: PrismaClient,
    private readonly directory: Pick<
      FinanceDirectory,
      "contractors" | "suppliers"
    >,
  ) {}

  async partyDues(
    workspaceId: string,
    scope: Scope,
    today: CalendarDate,
  ): Promise<CentralPartyDue[]> {
    const projectIds = scope.projectIds == null ? null : [...scope.projectIds];
    if (projectIds?.length === 0) return [];
    const place = (alias: string) =>
      projectIds == null
        ? Prisma.sql`TRUE`
        : Prisma.sql`${Prisma.raw(alias)}.project_id = ANY(${projectIds}::uuid[])`;
    const [invoices, advances, balances] = await Promise.all([
      loadDueInvoices(this.db, workspaceId, { projectIds, asOn: today }),
      this.db.$queryRaw<
        { partyType: PartyType; partyId: string; advance: bigint }[]
      >(Prisma.sql`
        SELECT p.party_type::text AS "partyType", p.party_id::text AS "partyId",
          COALESCE(SUM(p.amount + p.tds_amount - COALESCE((
            SELECT SUM(a.amount) FROM construction_finance.payment_allocations a
            WHERE a.payment_id = p.id AND a.deleted_at IS NULL
          ), 0)), 0)::bigint AS advance
        FROM construction_finance.party_payments p
        WHERE p.workspace_id = ${workspaceId}
          AND p.deleted_at IS NULL
          -- As on the same day as the dues beside it (loadDueInvoices).
          AND p.payment_date <= ${today}::date
          AND ${place("p")}
        GROUP BY 1, 2`),
      this.db.$queryRaw<
        {
          partyType: PartyType;
          partyId: string;
          balance: bigint;
          projects: bigint;
        }[]
      >(Prisma.sql`
        SELECT e.party_type::text AS "partyType", e.party_id::text AS "partyId",
          COALESCE(SUM(e.amount), 0)::bigint AS balance,
          COUNT(DISTINCT e.project_id) AS projects
        FROM construction_finance.party_entries e
        WHERE e.workspace_id = ${workspaceId} AND ${place("e")}
        GROUP BY 1, 2`),
    ]);
    const rows = new Map<string, CentralPartyDue>();
    const row = (party: { partyType: PartyType; partyId: string }) => {
      const key = partyKey(party);
      let found = rows.get(key);
      if (found == null) {
        found = {
          partyType: party.partyType,
          partyId: party.partyId,
          name: "",
          projectCount: 0,
          invoiced: 0n,
          paid: 0n,
          due: 0n,
          overdue: 0n,
          advance: 0n,
          receivable: 0n,
          balance: 0n,
        };
        rows.set(key, found);
      }
      return found;
    };
    for (const due of partyDues(invoices, today)) {
      const target = row(due);
      if (due.direction === "receivable") target.receivable += due.due;
      else {
        target.invoiced += due.invoiced;
        target.paid += due.paid + due.writtenOff;
        target.due += due.due;
        target.overdue += due.overdue;
      }
    }
    for (const advance of advances) row(advance).advance += advance.advance;
    for (const balance of balances) {
      const target = row(balance);
      target.balance = balance.balance;
      target.projectCount = Number(balance.projects);
    }
    const all = [...rows.values()].filter(
      (party) =>
        party.invoiced !== 0n ||
        party.advance !== 0n ||
        party.balance !== 0n ||
        party.receivable !== 0n,
    );
    const names = await partyNames(this.db, this.directory, workspaceId, all);
    for (const party of all) party.name = nameOfParty(names, party);
    return all.sort((a, b) =>
      b.due === a.due ? a.name.localeCompare(b.name) : b.due > a.due ? 1 : -1,
    );
  }

  /** Every live company account with its balance today and what is pending. */
  async companyAccounts(
    workspaceId: string,
    today: CalendarDate,
  ): Promise<CentralCompanyAccount[]> {
    const accounts = await this.db.constructionFinanceAccount.findMany({
      where: { workspaceId, deletedAt: null, kind: { in: ["cash", "bank"] } },
      select: {
        id: true,
        name: true,
        kind: true,
        isPrimary: true,
        bankName: true,
        accountNumber: true,
      },
      orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
    });
    const ids = accounts.map((account) => account.id);
    if (ids.length === 0) return [];
    const [balances, pending] = await Promise.all([
      accountLedger.balances(this.db, workspaceId, ids, today),
      this.db.$queryRaw<{ accountId: string; total: bigint; count: bigint }[]>(
        Prisma.sql`
          SELECT "accountId", COALESCE(SUM(effect), 0)::bigint AS total,
            COUNT(*) AS count
          FROM (
            SELECT account_id AS "accountId",
              CASE WHEN type = 'payment_in' THEN amount ELSE -amount END AS effect
            FROM construction_finance.transactions
            WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL
              AND approval_status = 'pending'
            UNION ALL
            SELECT from_account_id, -amount FROM construction_finance.account_transfers
            WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL
              AND approval_status = 'pending'
            UNION ALL
            SELECT to_account_id, amount FROM construction_finance.account_transfers
            WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL
              AND approval_status = 'pending'
            UNION ALL
            SELECT account_id, -amount FROM construction_finance.other_expenses
            WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL
              AND approval_status = 'pending'
            UNION ALL
            SELECT to_account_id, amount FROM construction_finance.petty_cash_vouchers
            WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL
              AND approval_status = 'pending' AND voucher_type = 'transfer'
          ) pending
          WHERE "accountId" = ANY(${ids}::uuid[])
          GROUP BY "accountId"`,
      ),
    ]);
    const byAccount = new Map(pending.map((row) => [row.accountId, row]));
    return accounts.map((account) => ({
      id: account.id,
      name: account.name,
      kind: account.kind === "bank" ? "bank" : "cash",
      isPrimary: account.isPrimary,
      bankName: account.bankName,
      accountLast4:
        account.accountNumber == null ? null : account.accountNumber.slice(-4),
      balance: balances.get(account.id) ?? 0n,
      pendingTotal: byAccount.get(account.id)?.total ?? 0n,
      pendingCount: Number(byAccount.get(account.id)?.count ?? 0n),
    }));
  }
}
