import { todayIn, type CalendarDate } from "@/src/shared-kernel/calendar-date";

import { buildLabourAttendanceReport } from "../domain/labour-attendance-report";
import { buildMonthWiseLabourReport } from "../domain/labour-month-report";
import { buildLabourPaymentReport } from "../domain/labour-payment-report";
import { buildMusterRoll } from "../domain/muster-roll";
import type { ReportBody, ReportDocument } from "../domain/report-document";
import { reportFileName, type ReportJob } from "../domain/report-job";
import {
  financialYearRange,
  monthLabel,
  monthRange,
  rangeLabel,
} from "../domain/report-period";
import { generatedByLine } from "../domain/report-footer";
import { buildVendorAttendanceReport } from "../domain/vendor-attendance-report";
// Site work reports (CM-605, CM-608).
import {
  SITE_WORK_A3_KINDS,
  siteWorkReportBody,
} from "./build-site-work-report";
// Finance reports (CM-709).
import { FINANCE_A3_KINDS, financeReportBody } from "./build-finance-report";
// Tracking reports (CM-805).
import {
  TRACKING_A3_KINDS,
  TRACKING_TABLE_KINDS,
  trackingReportBody,
} from "./build-tracking-report";
// Procurement and central labour reports (CM-903).
import {
  PROCUREMENT_A3_KINDS,
  procurementReportBody,
} from "./build-procurement-report";
import { buildCentralLabourAttendanceReport } from "../domain/central-labour-attendance-report";
// Sales reports (CM-1008).
import { salesReportBody, SALES_TABLE_KINDS } from "./build-sales-report";
// Contracts reports (CM-1111).
import {
  CONTRACTS_TABLE_KINDS,
  contractsReportBody,
} from "./build-contracts-report";
import type {
  ContractsReportSource,
  FinanceReportSource,
  HeaderFacts,
  ProcurementReportSource,
  ReportSource,
  SalesReportSource,
  TrackingReportSource,
} from "./ports";

/** What a job covers, as its header and Downloads print it. */
export function periodLabel(job: Pick<ReportJob, "params">): string {
  const params = job.params;
  switch (params.kind) {
    case "labour_month":
    case "muster_roll":
      return monthLabel(params.month);
    case "daily_progress_report":
      return rangeLabel({ from: params.date, to: params.date });
    case "task_progress_report":
      return rangeLabel(params);
    // Finance reports (CM-709).
    case "tds_194c":
      return `FY ${params.fy} (${rangeLabel(financialYearRange(params.fy))})`;
    case "due_payments":
    case "boq_vs_executed":
    case "material_reconciliation":
    case "retention_register":
      return `As on ${rangeLabel({ from: params.asOn, to: params.asOn })}`;
    default:
      return rangeLabel(params);
  }
}

async function bodyFor(
  job: ReportJob,
  source: ReportSource,
  today: CalendarDate,
  finance: FinanceReportSource | undefined,
  tracking: TrackingReportSource | undefined,
  procurement: ProcurementReportSource | undefined,
  sales: SalesReportSource | undefined,
  contracts: ContractsReportSource | undefined,
): Promise<ReportBody> {
  const params = job.params;
  const projectId = job.projectId ?? "";
  switch (params.kind) {
    case "labour_attendance": {
      const data = await source.labourDays(job.workspaceId, projectId, params);
      return buildLabourAttendanceReport({ range: params, ...data });
    }
    case "labour_payment": {
      const data = await source.labourLedger(
        job.workspaceId,
        projectId,
        params,
      );
      return buildLabourPaymentReport({ range: params, ...data });
    }
    case "labour_month": {
      const data = await source.labourDays(
        job.workspaceId,
        projectId,
        monthRange(params.month),
      );
      return buildMonthWiseLabourReport({
        month: params.month,
        financial: job.includesMoney,
        ...data,
      });
    }
    case "muster_roll": {
      const data = await source.musterRoll(
        job.workspaceId,
        projectId,
        monthRange(params.month),
      );
      return buildMusterRoll({ month: params.month, ...data });
    }
    case "vendor_attendance": {
      const central = job.projectId == null;
      const data = await source.vendorLines(job.workspaceId, {
        projectIds: central ? params.projectIds : [projectId],
        range: params,
        vendorId: params.vendorId,
        labourCategoryId: params.labourCategoryId,
      });
      return buildVendorAttendanceReport({
        lines: data.lines,
        financial: job.includesMoney,
        central,
        filters: { vendor: data.vendorName, category: data.categoryName },
      });
    }
    // Site work reports (CM-605, CM-608).
    case "daily_work":
    case "owned_equipment_usage":
    case "rented_equipment_usage":
    case "equipment_maintenance":
    case "equipment_transfers":
      return siteWorkReportBody(job, params, source, today);
    // Finance reports (CM-709).
    case "account_ledger":
    case "petty_cash":
    case "transactions":
    case "contractor_payments":
    case "supplier_payments":
    case "other_expenses":
    case "tds_194c":
    case "due_payments":
      return financeReportBody(job, params, finance);
    // Tracking reports (CM-805).
    case "task_report":
    case "issue_snag_report":
    case "inspection_request_report":
      return trackingReportBody(job, params, tracking, today);
    // Procurement and central labour reports (CM-903).
    case "purchase_requests":
    case "purchase_orders":
    case "material_received":
    case "material_transfers":
    case "stock_register":
      return procurementReportBody(job, params, procurement);
    case "labour_attendance_central": {
      const data = await source.projectLabourDays(
        job.workspaceId,
        params.projectIds,
        params,
      );
      return buildCentralLabourAttendanceReport({
        range: params,
        ...data,
        covers: params.projectsChosen
          ? "chosen"
          : params.projectIds == null
            ? "all"
            : "assigned",
      });
    }
    // Sales reports (CM-1008).
    case "inquiry_report":
    case "booking_report":
      return salesReportBody(job, params, sales, today);
    // Contracts reports (CM-1111).
    case "boq_vs_executed":
    case "work_order_register":
    case "contractor_bill_register":
    case "client_bill_register":
    case "deductions_register":
    case "retention_register":
    case "material_reconciliation":
    case "variations_register":
      return contractsReportBody(job, params, contracts);
    case "daily_progress_report":
    case "task_progress_report":
      // PDFs of their own, not table reports (`createReportExecutor`).
      throw new Error("A Progress Report is not a table report.");
  }
}

/** The calendar date of `now` in the Company's time zone (India if unknown). */
function companyDate(timeZone: string, now: Date): CalendarDate {
  try {
    return todayIn(timeZone, now);
  } catch {
    return todayIn("Asia/Kolkata", now);
  }
}

/** Reads what the job's report needs and lays it out as a document. */
export async function buildReportDocument(
  job: ReportJob,
  source: ReportSource,
  now: Date,
  /** The finance reports' read model (CM-709), wired by the composition root. */
  finance?: FinanceReportSource,
  /** The tracking reports' read model (CM-805). */
  tracking?: TrackingReportSource,
  /** The procurement reports' read model (CM-903). */
  procurement?: ProcurementReportSource,
  /** The sales reports' read model (CM-1008). */
  sales?: SalesReportSource,
  /** The contracts reports' read model (CM-1111). */
  contracts?: ContractsReportSource,
): Promise<ReportDocument> {
  const facts: HeaderFacts = await source.header(
    job.workspaceId,
    job.projectId,
    job.requestedBy,
  );
  const body = await bodyFor(
    job,
    source,
    companyDate(facts.timezone, now),
    finance,
    tracking,
    procurement,
    sales,
    contracts,
  );
  return {
    header: {
      company: facts.companyName,
      title: body.title,
      project: facts.project?.name ?? "All projects",
      address: facts.project?.address ?? null,
      period: periodLabel(job),
      generated: generatedByLine(facts.requesterName, now, facts.timezone),
      logo: facts.logo,
      currency: facts.currency,
    },
    notes: body.notes,
    tables: body.tables,
    pageSize:
      job.kind === "muster_roll" ||
      SITE_WORK_A3_KINDS.includes(job.kind) ||
      FINANCE_A3_KINDS.includes(job.kind) ||
      TRACKING_A3_KINDS.includes(job.kind) ||
      PROCUREMENT_A3_KINDS.includes(job.kind) ||
      SALES_TABLE_KINDS.includes(job.kind) ||
      CONTRACTS_TABLE_KINDS.includes(job.kind)
        ? "a3"
        : "a4",
    fileName: reportFileName(job.params),
    // Tracking reports print names and remarks in any script (CM-805).
    // So do the procurement reports: material and party names (CM-903).
    // And the sales reports: customers' names (CM-1008).
    ...(TRACKING_TABLE_KINDS.includes(job.kind) ||
    PROCUREMENT_A3_KINDS.includes(job.kind) ||
    SALES_TABLE_KINDS.includes(job.kind) ||
    // And the contracts reports: Contractor, Client and item names (CM-1111).
    CONTRACTS_TABLE_KINDS.includes(job.kind) ||
    job.kind === "labour_attendance_central"
      ? { fonts: "noto" as const }
      : {}),
  };
}
