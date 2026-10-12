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
import { buildVendorAttendanceReport } from "../domain/vendor-attendance-report";
// Site work reports (CM-605, CM-608).
import {
  SITE_WORK_A3_KINDS,
  siteWorkReportBody,
} from "./build-site-work-report";
// Finance reports (CM-709).
import { FINANCE_A3_KINDS, financeReportBody } from "./build-finance-report";
import type { FinanceReportSource, HeaderFacts, ReportSource } from "./ports";

/** `09 Oct 2026, 4:05 pm IST` in the Company's time zone. */
export function generatedAtLabel(at: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone,
      timeZoneName: "short",
    }).format(at);
  } catch {
    return `${at.toISOString().slice(0, 16).replace("T", " ")} UTC`;
  }
}

function periodLabel(job: ReportJob): string {
  const params = job.params;
  switch (params.kind) {
    case "labour_month":
    case "muster_roll":
      return monthLabel(params.month);
    case "daily_progress_report":
      return rangeLabel({ from: params.date, to: params.date });
    // Finance reports (CM-709).
    case "tds_194c":
      return `FY ${params.fy} (${rangeLabel(financialYearRange(params.fy))})`;
    case "due_payments":
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
    case "daily_progress_report":
      // A PDF of its own, not a table report (`createReportExecutor`).
      throw new Error("The Daily Progress Report is not a table report.");
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
): Promise<ReportDocument> {
  const facts: HeaderFacts = await source.header(
    job.workspaceId,
    job.projectId,
  );
  const body = await bodyFor(
    job,
    source,
    companyDate(facts.timezone, now),
    finance,
  );
  return {
    header: {
      company: facts.companyName,
      title: body.title,
      project: facts.project?.name ?? "All projects",
      address: facts.project?.address ?? null,
      period: periodLabel(job),
      generatedAt: generatedAtLabel(now, facts.timezone),
      currency: facts.currency,
    },
    notes: body.notes,
    tables: body.tables,
    pageSize:
      job.kind === "muster_roll" ||
      SITE_WORK_A3_KINDS.includes(job.kind) ||
      FINANCE_A3_KINDS.includes(job.kind)
        ? "a3"
        : "a4",
    fileName: reportFileName(job.params),
  };
}
