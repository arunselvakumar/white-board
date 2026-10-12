import { Prisma, type PrismaClient } from "@repo/construction-db";

import type { CalendarDate } from "@/src/shared-kernel/calendar-date";

import type { FinanceDirectory } from "../application/ports";
import { partyDues, type PartyDue } from "../domain/dues";
import type { PartyType } from "../domain/ledger";
import {
  monthlyFlows,
  monthsBetween,
  type MonthFlow,
  type PaymentModule,
} from "../domain/payment-flows";
import { loadDueInvoices, nameOfParty, partyNames } from "./due-invoices";

type Range = { from: CalendarDate; to: CalendarDate };

export type DashboardDue = {
  partyType: PartyType;
  partyId: string;
  name: string;
  invoiced: bigint;
  /** Allocated (money and TDS) plus written off. */
  paid: bigint;
  due: bigint;
  overdue: bigint;
};

export type PaymentsSection = {
  months: MonthFlow[];
  totals: { in: bigint; out: bigint; net: bigint };
  dues: DashboardDue[];
  modules: Record<PaymentModule, bigint>;
};

export type PendingPaymentApprovals = {
  transactions: number;
  transfers: number;
  vouchers: number;
  otherExpenses: number;
  settlements: number;
};

/**
 * Entries that are money in or out of the business: no openings and no
 * transfers between the Company's own accounts. A reversal counts against
 * the side of the entry it reverses, in the month of its own date.
 */
const FLOW = Prisma.sql`kind NOT IN ('opening', 'transfer_in', 'transfer_out')`;
const SIDE = Prisma.sql`CASE WHEN reverses_entry_id IS NULL THEN sign(amount) ELSE -sign(amount) END`;

/**
 * The Project Dashboard's Payments section and Payment Approvals KPI
 * (CM-709, ADR CM-0017 §16), read from the account ledger, invoices and
 * allocations, party payments, Other Expenses and (through the directory)
 * M2's wage payments.
 */
export class FinanceDashboard {
  constructor(
    private readonly db: PrismaClient,
    private readonly directory: Pick<
      FinanceDirectory,
      "contractors" | "suppliers" | "wagesPaid"
    >,
  ) {}

  /** In / out by month, the balance, and the Project's net before the duration. */
  async flows(
    workspaceId: string,
    projectId: string,
    range: Range,
  ): Promise<MonthFlow[]> {
    const [sums, before] = await Promise.all([
      this.db.$queryRaw<{ month: string; in: bigint; out: bigint }[]>(
        Prisma.sql`
          SELECT to_char(entry_date, 'YYYY-MM') AS month,
            COALESCE(SUM(amount) FILTER (WHERE ${SIDE} > 0), 0)::bigint AS "in",
            COALESCE(-SUM(amount) FILTER (WHERE ${SIDE} < 0), 0)::bigint AS out
          FROM construction_finance.account_entries
          WHERE workspace_id = ${workspaceId}
            AND project_id = ${projectId}::uuid
            AND ${FLOW}
            AND entry_date BETWEEN ${range.from}::date AND ${range.to}::date
          GROUP BY 1`,
      ),
      this.db.$queryRaw<{ amount: bigint }[]>(Prisma.sql`
        SELECT COALESCE(SUM(amount), 0)::bigint AS amount
        FROM construction_finance.account_entries
        WHERE workspace_id = ${workspaceId}
          AND project_id = ${projectId}::uuid
          AND ${FLOW}
          AND entry_date < ${range.from}::date`),
    ]);
    return monthlyFlows(
      monthsBetween(range.from, range.to),
      sums,
      before[0]?.amount ?? 0n,
    );
  }

  /** Parties with something due on bills from them on the Project, on `asOn`. */
  async dues(
    workspaceId: string,
    projectId: string,
    asOn: CalendarDate,
  ): Promise<DashboardDue[]> {
    const invoices = await loadDueInvoices(this.db, workspaceId, {
      projectIds: [projectId],
      asOn,
      direction: "payable",
    });
    const dues = partyDues(invoices, asOn).filter((due) => due.due > 0n);
    const names = await partyNames(this.db, this.directory, workspaceId, dues);
    return dues
      .map((due: PartyDue) => ({
        partyType: due.partyType,
        partyId: due.partyId,
        name: nameOfParty(names, due),
        invoiced: due.invoiced,
        paid: due.paid + due.writtenOff,
        due: due.due,
        overdue: due.overdue,
      }))
      .sort((a, b) =>
        b.due === a.due ? a.name.localeCompare(b.name) : b.due > a.due ? 1 : -1,
      );
  }

  /**
   * Money paid out on the Project in the duration, by module: party
   * payments by party type (money, not TDS), wage payments to Labours and
   * Vendors, and approved Other Expenses.
   */
  async modules(
    workspaceId: string,
    projectId: string,
    range: Range,
  ): Promise<Record<PaymentModule, bigint>> {
    const dates = {
      gte: new Date(`${range.from}T00:00:00.000Z`),
      lte: new Date(`${range.to}T00:00:00.000Z`),
    };
    const [parties, expenses, wages] = await Promise.all([
      this.db.constructionFinancePartyPayment.groupBy({
        by: ["partyType"],
        where: {
          workspaceId,
          projectId,
          direction: "out",
          deletedAt: null,
          paymentDate: dates,
        },
        _sum: { amount: true },
      }),
      this.db.constructionFinanceOtherExpense.aggregate({
        where: {
          workspaceId,
          projectId,
          approvalStatus: "approved",
          deletedAt: null,
          expenseDate: dates,
        },
        _sum: { amount: true },
      }),
      this.directory.wagesPaid(this.db, workspaceId, projectId, range),
    ]);
    const party = (type: PartyType) =>
      parties.find((row) => row.partyType === type)?._sum.amount ?? 0n;
    return {
      contractor: party("contractor"),
      supplier: party("supplier"),
      labour: wages.labour,
      vendor: wages.vendor,
      other_party: party("other_party"),
      other_expense: expenses._sum.amount ?? 0n,
    };
  }

  async payments(
    workspaceId: string,
    projectId: string,
    range: Range,
  ): Promise<PaymentsSection> {
    const [months, dues, modules] = await Promise.all([
      this.flows(workspaceId, projectId, range),
      this.dues(workspaceId, projectId, range.to),
      this.modules(workspaceId, projectId, range),
    ]);
    const totalIn = months.reduce((sum, month) => sum + month.in, 0n);
    const totalOut = months.reduce((sum, month) => sum + month.out, 0n);
    return {
      months,
      totals: { in: totalIn, out: totalOut, net: totalIn - totalOut },
      dues,
      modules,
    };
  }

  /**
   * Pending documents on the Project waiting for a decision: Transactions,
   * transfers and petty-cash vouchers that name it, its Other Expenses, and
   * settlements of its invoices.
   */
  async pendingApprovals(
    workspaceId: string,
    projectId: string,
  ): Promise<PendingPaymentApprovals> {
    const pending = {
      workspaceId,
      projectId,
      approvalStatus: "pending",
      deletedAt: null,
    } as const;
    const [transactions, transfers, vouchers, otherExpenses, settlements] =
      await Promise.all([
        this.db.constructionFinanceTransaction.count({ where: pending }),
        this.db.constructionFinanceAccountTransfer.count({ where: pending }),
        this.db.constructionFinancePettyCashVoucher.count({ where: pending }),
        this.db.constructionFinanceOtherExpense.count({ where: pending }),
        this.db.constructionFinanceSettlement.count({
          where: {
            workspaceId,
            approvalStatus: "pending",
            deletedAt: null,
            invoice: { projectId, deletedAt: null },
          },
        }),
      ]);
    return { transactions, transfers, vouchers, otherExpenses, settlements };
  }
}
