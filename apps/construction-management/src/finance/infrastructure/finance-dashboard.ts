import { Prisma, type PrismaClient } from "@repo/construction-db";

import type { CalendarDate } from "@/src/shared-kernel/calendar-date";

import type { FinanceDirectory } from "../application/ports";
import type { PartyType } from "../domain/ledger";
import {
  monthlyFlows,
  monthsBetween,
  type MonthFlow,
  type PaymentModule,
} from "../domain/payment-flows";

type Range = { from: CalendarDate; to: CalendarDate };

export type PaymentsSection = {
  months: MonthFlow[];
  totals: { in: bigint; out: bigint; net: bigint };
  modules: Record<PaymentModule, bigint>;
};

/**
 * Entries that are money in or out of the business: no openings and no
 * transfers between the Company's own accounts. A reversal counts against
 * the side of the entry it reverses, in the month of its own date.
 */
const FLOW = Prisma.sql`kind NOT IN ('opening', 'transfer_in', 'transfer_out')`;
const SIDE = Prisma.sql`CASE WHEN reverses_entry_id IS NULL THEN sign(amount) ELSE -sign(amount) END`;

/**
 * The Project Dashboard's Payments section (CM-709, ADR CM-0017 §16),
 * read from the account ledger, party payments, Other Expenses and
 * (through the directory) M2's wage payments. Due Payments and the Payment
 * Approvals KPI read the reporting views since CM-902
 * (`src/reporting/infrastructure/prisma-dashboard-source.ts`).
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
    const [months, modules] = await Promise.all([
      this.flows(workspaceId, projectId, range),
      this.modules(workspaceId, projectId, range),
    ]);
    const totalIn = months.reduce((sum, month) => sum + month.in, 0n);
    const totalOut = months.reduce((sum, month) => sum + month.out, 0n);
    return {
      months,
      totals: { in: totalIn, out: totalOut, net: totalIn - totalOut },
      modules,
    };
  }
}
