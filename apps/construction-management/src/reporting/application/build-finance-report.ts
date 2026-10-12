import {
  buildDuePaymentsReport,
  buildLedgerReport,
  buildOtherExpensesReport,
  buildPartyPaymentsReport,
  buildPettyCashReport,
  buildTdsReport,
  buildTransactionsReport,
} from "../domain/finance-reports";
import type { ReportBody } from "../domain/report-document";
import type { ReportJob, ReportParams } from "../domain/report-job";
import { financialYearRange } from "../domain/report-period";
import type { FinanceReportSource } from "./ports";

export type FinanceReportParams = Extract<
  ReportParams,
  {
    kind:
      | "account_ledger"
      | "petty_cash"
      | "transactions"
      | "contractor_payments"
      | "supplier_payments"
      | "other_expenses"
      | "tds_194c"
      | "due_payments";
  }
>;

/** Wide finance registers print on A3. */
export const FINANCE_A3_KINDS: readonly ReportJob["kind"][] = [
  "account_ledger",
  "transactions",
  "due_payments",
];

/** The body of a finance report (CM-709). */
export async function financeReportBody(
  job: ReportJob,
  params: FinanceReportParams,
  source: FinanceReportSource | undefined,
): Promise<ReportBody> {
  if (source == null)
    throw new Error("The finance report source is not wired.");
  const projectId = job.projectId ?? "";
  switch (params.kind) {
    case "account_ledger":
      return buildLedgerReport(
        await source.ledger(job.workspaceId, params),
        params,
      );
    case "petty_cash": {
      const data = await source.pettyCash(job.workspaceId, projectId, params);
      return buildPettyCashReport({
        ...data,
        ownOnly: params.accountIds != null && params.accountId == null,
      });
    }
    case "transactions":
      return buildTransactionsReport(
        await source.transactions(job.workspaceId, projectId, params),
      );
    case "contractor_payments":
    case "supplier_payments": {
      const partyType =
        params.kind === "contractor_payments" ? "contractor" : "supplier";
      const data = await source.partyPayments(job.workspaceId, projectId, {
        partyType,
        range: { from: params.from, to: params.to },
        partyId: params.partyId,
      });
      return buildPartyPaymentsReport({ partyType, ...data });
    }
    case "other_expenses":
      return buildOtherExpensesReport(
        await source.otherExpenses(job.workspaceId, projectId, params),
      );
    case "tds_194c": {
      const payments = await source.tds(job.workspaceId, {
        range: financialYearRange(params.fy),
        contractorId: params.contractorId,
        projectIds: params.projectIds,
      });
      return buildTdsReport({
        fy: params.fy,
        payments,
        limited: params.projectIds != null,
      });
    }
    case "due_payments": {
      const central = job.projectId == null;
      const parties = await source.duePayments(job.workspaceId, {
        asOn: params.asOn,
        projectIds: central ? params.projectIds : [projectId],
      });
      return buildDuePaymentsReport({
        asOn: params.asOn,
        parties,
        central,
        limited: central && params.projectIds != null,
      });
    }
  }
}
