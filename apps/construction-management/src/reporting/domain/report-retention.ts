import { isProgressReport, type ReportJob } from "./report-job";

/**
 * How long a report's files are kept after it finished (ADR CM-0021 §3).
 * Progress Reports are kept until someone deletes them (CM-0016).
 */
export const REPORT_RETENTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** When retention deletes the job's files; null when it never will. */
export function reportExpiresAt(
  job: Pick<ReportJob, "kind" | "status" | "finishedAt">,
): Date | null {
  if (isProgressReport(job.kind) || job.status !== "done") return null;
  if (job.finishedAt == null) return null;
  return new Date(job.finishedAt.getTime() + REPORT_RETENTION_DAYS * DAY_MS);
}

/** Jobs that finished before this instant are past retention at `now`. */
export function retentionCutoff(now: Date): Date {
  return new Date(now.getTime() - REPORT_RETENTION_DAYS * DAY_MS);
}
