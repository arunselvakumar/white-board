import type { ObjectStorage } from "@/src/shared-kernel/files";

import type {
  DprDocument,
  DprReadModel,
} from "../domain/daily-progress-report";
import type { ReportLabour, ReportLabourDay } from "../domain/labour-days";
import type { ReportLedgerEntry } from "../domain/ledger-summary";
import type { ReportDocument } from "../domain/report-document";
import type { DateRange } from "../domain/report-period";
import type { ReportJob, ReportKind, ReportParams } from "../domain/report-job";
import type { ReportVendorLine } from "../domain/vendor-attendance-report";
// Site work reports (CM-605, CM-608).
import type { ReportWorksheet } from "../domain/daily-work-report";
import type {
  ReportMaintenanceEntry,
  ReportTransfer,
} from "../domain/equipment-lifecycle-reports";
import type { ReportUsageSheet } from "../domain/equipment-usage-report";

/** A rendered file written to storage for a job. */
export type ReportFile = {
  key: string;
  contentType: string;
  bytes: number;
};

/** Where jobs live (`construction_reporting.report_jobs`). */
export type ReportJobStore = {
  create(job: ReportJob): Promise<void>;
  /** Null when there is no such job in the Company. */
  get(workspaceId: string, id: string): Promise<ReportJob | null>;
  /** Newest first. `projectId` null lists central jobs. */
  list(
    workspaceId: string,
    filter: {
      projectId: string | null;
      kinds: readonly ReportKind[];
      requestedBy?: string;
      limit: number;
    },
  ): Promise<ReportJob[]>;
  markRunning(id: string, at: Date): Promise<void>;
  /**
   * Marks a running job done and records its files as stored, in one
   * transaction. False (nothing written) when the job is no longer
   * running: it timed out or was deleted meanwhile.
   */
  markDone(
    job: ReportJob,
    files: { xlsx: ReportFile | null; pdf: ReportFile; fileName: string },
    at: Date,
  ): Promise<boolean>;
  /** Fails a queued or running job; false when it had already finished. */
  markFailed(id: string, error: string, at: Date): Promise<boolean>;
  /** A failed job back to queued (Retry); false when it is not failed. */
  requeue(workspaceId: string, id: string): Promise<boolean>;
  /**
   * Deletes the job and stops counting its files as stored, with an audit
   * event, in one transaction. The caller deletes the objects after.
   */
  remove(job: ReportJob, by: string, at: Date): Promise<void>;
};

/** The Company and Project facts printed in a report header. */
export type HeaderFacts = {
  companyName: string;
  timezone: string;
  currency: string;
  /** Null for a central report. */
  project: { name: string; address: string | null } | null;
};

/**
 * What the reports read from other contexts (labour, masters, projects,
 * organization), by plain reads of their tables: reporting is a read model.
 */
export type ReportSource = SiteWorkReportSource & {
  header(workspaceId: string, projectId: string | null): Promise<HeaderFacts>;
  /** Labours marked in the Project in the range, with their days. */
  labourDays(
    workspaceId: string,
    projectId: string,
    range: DateRange,
  ): Promise<{ labours: ReportLabour[]; days: ReportLabourDay[] }>;
  /**
   * Labours on the Project now or with ledger entries for it in the
   * range, and every one of their entries up to the range's end.
   */
  labourLedger(
    workspaceId: string,
    projectId: string,
    range: DateRange,
  ): Promise<{ labours: ReportLabour[]; entries: ReportLedgerEntry[] }>;
  /**
   * The muster roll's Labours: marked in the Project in the month, or on
   * it now and joined by the month's end; their days in the month, and
   * their advance and payment entries for the Project in the month.
   */
  musterRoll(
    workspaceId: string,
    projectId: string,
    range: DateRange,
  ): Promise<{
    labours: ReportLabour[];
    days: ReportLabourDay[];
    entries: ReportLedgerEntry[];
  }>;
  vendorLines(
    workspaceId: string,
    filter: {
      /** Null is every Project of the Company. */
      projectIds: string[] | null;
      range: DateRange;
      vendorId: string | null;
      labourCategoryId: string | null;
    },
  ): Promise<{
    lines: ReportVendorLine[];
    vendorName: string | null;
    categoryName: string | null;
  }>;
};

/**
 * The Daily Progress Report's read model (CM-606): site work, labour,
 * procurement, masters and projects for one Project and date. Implemented
 * in `src/composition/progress-report-source.ts`, which may read every
 * context; reporting only sees this port.
 */
export type DprSource = {
  read(input: {
    workspaceId: string;
    projectId: string;
    params: Extract<ReportParams, { kind: "daily_progress_report" }>;
    /** Hire cost is read only when the job carries money. */
    money: boolean;
  }): Promise<DprReadModel>;
};

/** Prints a laid-out DPR as a PDF, embedding its logo and photos. */
export type DprRenderer = (document: DprDocument) => Promise<Uint8Array>;

/**
 * What the site-work reports read (CM-605, CM-608) from site-work, masters,
 * projects and organization tables. A filter id that is not the Company's
 * fails the job with a domain error naming it.
 */
export type SiteWorkReportSource = {
  /** Live, not rejected worksheets of the Project in the range. */
  dailyWork(
    workspaceId: string,
    projectId: string,
    filter: { range: DateRange; contractorId: string | null },
  ): Promise<{ worksheets: ReportWorksheet[]; contractorName: string | null }>;
  /** Live, not rejected usage sheets of one ownership at the Project. */
  equipmentUsage(
    workspaceId: string,
    projectId: string,
    filter: {
      range: DateRange;
      ownership: "owned" | "rented";
      equipmentId: string | null;
    },
  ): Promise<{ sheets: ReportUsageSheet[]; equipmentName: string | null }>;
  /**
   * Live maintenance entries overlapping the range; with a Project, only
   * those of machines at that Project when the entry started.
   */
  equipmentMaintenance(
    workspaceId: string,
    filter: { range: DateRange; projectId: string | null },
  ): Promise<ReportMaintenanceEntry[]>;
  /** Transfers in the range; with a Project, out of or into it. */
  equipmentTransfers(
    workspaceId: string,
    filter: { range: DateRange; projectId: string | null },
  ): Promise<ReportTransfer[]>;
};

/** Whether a Project is a live Project of the Company (projects context). */
export type ProjectLookup = {
  exists(workspaceId: string, projectId: string): Promise<boolean>;
};

export type ReportRenderer = {
  xlsx(document: ReportDocument): Promise<Uint8Array>;
  pdf(document: ReportDocument): Promise<Uint8Array>;
};

/**
 * Runs a queued job (CM-217). M2's runner runs it inline in the request;
 * M9 swaps in one that sends the job id to SQS for the worker, which calls
 * the same `ReportExecutor`. Callers never know which.
 */
export type ReportRunner = {
  enqueue(job: Pick<ReportJob, "id" | "workspaceId">): Promise<void>;
};

export type ReportStorage = ObjectStorage;
