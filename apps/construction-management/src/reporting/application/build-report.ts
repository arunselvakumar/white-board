import { buildLabourAttendanceReport } from "../domain/labour-attendance-report";
import { buildMonthWiseLabourReport } from "../domain/labour-month-report";
import { buildLabourPaymentReport } from "../domain/labour-payment-report";
import { buildMusterRoll } from "../domain/muster-roll";
import type { ReportBody, ReportDocument } from "../domain/report-document";
import { reportFileName, type ReportJob } from "../domain/report-job";
import { monthLabel, monthRange, rangeLabel } from "../domain/report-period";
import { buildVendorAttendanceReport } from "../domain/vendor-attendance-report";
import type { HeaderFacts, ReportSource } from "./ports";

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
  return params.kind === "labour_month" || params.kind === "muster_roll"
    ? monthLabel(params.month)
    : rangeLabel(params);
}

async function bodyFor(
  job: ReportJob,
  source: ReportSource,
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
  }
}

/** Reads what the job's report needs and lays it out as a document. */
export async function buildReportDocument(
  job: ReportJob,
  source: ReportSource,
  now: Date,
): Promise<ReportDocument> {
  const facts: HeaderFacts = await source.header(
    job.workspaceId,
    job.projectId,
  );
  const body = await bodyFor(job, source);
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
    pageSize: job.kind === "muster_roll" ? "a3" : "a4",
    fileName: reportFileName(job.params),
  };
}
