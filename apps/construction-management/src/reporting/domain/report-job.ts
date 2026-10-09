import { DomainError } from "@/src/shared-kernel/domain-error";

import { checkRange, monthRange } from "./report-period";

export const REPORT_KINDS = [
  "labour_attendance",
  "labour_payment",
  "labour_month",
  "vendor_attendance",
  "muster_roll",
] as const;

export type ReportKind = (typeof REPORT_KINDS)[number];

export const REPORT_TITLES: Record<ReportKind, string> = {
  labour_attendance: "All Labour Attendance",
  labour_payment: "All Labour Payment",
  labour_month: "Month-wise Labour",
  vendor_attendance: "Vendor Attendance",
  muster_roll: "Muster roll and wage register",
};

/** What each kind is filtered by. Dates are `YYYY-MM-DD`, months `YYYY-MM`. */
export type ReportParams =
  | { kind: "labour_attendance"; from: string; to: string }
  | { kind: "labour_payment"; from: string; to: string }
  | { kind: "labour_month"; month: string }
  | {
      kind: "vendor_attendance";
      from: string;
      to: string;
      vendorId: string | null;
      labourCategoryId: string | null;
      /**
       * A central report (no Project on the job): the Projects the
       * requester could see when they asked, fixed with the job; null is
       * every Project of the Company (the Owner). Unused on a Project's
       * report.
       */
      projectIds: string[] | null;
    }
  | { kind: "muster_roll"; month: string };

export type JobStatus = "queued" | "running" | "done" | "failed";

/** A requested report and, once done, its two files (CM-217). */
export type ReportJob = {
  id: string;
  workspaceId: string;
  /** Null for a central report. */
  projectId: string | null;
  kind: ReportKind;
  params: ReportParams;
  status: JobStatus;
  /** The files carry amounts; downloading needs Financial. */
  includesMoney: boolean;
  xlsxKey: string | null;
  pdfKey: string | null;
  fileName: string | null;
  error: string | null;
  requestedBy: string;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
};

/**
 * How long a report may run. M2 runs the job inside the request, so this
 * is the `maxDuration` of the POST route (Next.js wants a literal there;
 * the route's HTTP test keeps the two equal).
 */
export const REPORT_TIME_LIMIT_SECONDS = 60;

/**
 * A job still queued or running this long after it started (or, never
 * started, after it was queued) was cut off by the platform: nothing will
 * ever mark it failed, so readers treat it as failed. The margin keeps a
 * job that finishes right at the limit from being called failed.
 */
export const REPORT_STALE_AFTER_SECONDS = REPORT_TIME_LIMIT_SECONDS + 30;

export const REPORT_TIMED_OUT_MESSAGE =
  "The report took too long. Try a shorter period.";

/**
 * The job as a reader should see it at `now`: a stale queued or running
 * job is failed with {@link REPORT_TIMED_OUT_MESSAGE}. Only the read model
 * changes; the row is left alone, so reads never write and a run that does
 * finish late (a server without the time limit) still lands as done.
 */
export function withTimeLimit(job: ReportJob, now: Date): ReportJob {
  if (job.status !== "queued" && job.status !== "running") return job;
  const since = job.startedAt ?? job.createdAt;
  if (now.getTime() - since.getTime() <= REPORT_STALE_AFTER_SECONDS * 1000)
    return job;
  return { ...job, status: "failed", error: REPORT_TIMED_OUT_MESSAGE };
}

/** Checks the period of a request (≤ 366 days, a real month). */
export function checkReportParams(params: ReportParams): ReportParams {
  switch (params.kind) {
    case "labour_attendance":
    case "labour_payment":
    case "vendor_attendance":
      return { ...params, ...checkRange(params) };
    case "labour_month":
    case "muster_roll":
      monthRange(params.month);
      return params;
  }
}

/** Only a vendor report can be central; the others need a Project. */
export function checkReportScope(
  kind: ReportKind,
  projectId: string | null,
): void {
  if (projectId == null && kind !== "vendor_attendance")
    throw new DomainError(
      "REPORT_PROJECT_REQUIRED",
      "Choose a Project for this report.",
    );
}

/** Reports that are about money; refused without Financial. */
export function isMoneyReport(kind: ReportKind): boolean {
  return kind === "labour_payment" || kind === "muster_roll";
}

/** The download name: `all-labour-attendance-2026-09-01-to-2026-09-30`. */
export function reportFileName(params: ReportParams): string {
  const slug = REPORT_TITLES[params.kind]
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  switch (params.kind) {
    case "labour_month":
    case "muster_roll":
      return `${slug}-${params.month}`;
    default:
      return params.from === params.to
        ? `${slug}-${params.from}`
        : `${slug}-${params.from}-to-${params.to}`;
  }
}

/**
 * A failed job keeps a message a screen can show, never a stack. A domain
 * refusal keeps its own words; anything unexpected (a database or storage
 * error) gets a generic message so internals never reach the screen.
 */
export function failureMessage(error: unknown): string {
  if (error instanceof DomainError) return error.message;
  return "The report could not be generated. Try again; if it keeps failing, contact support.";
}
