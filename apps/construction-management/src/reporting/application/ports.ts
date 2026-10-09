import type { ObjectStorage } from "@/src/shared-kernel/files";

import type { ReportLabour, ReportLabourDay } from "../domain/labour-days";
import type { ReportLedgerEntry } from "../domain/ledger-summary";
import type { ReportDocument } from "../domain/report-document";
import type { DateRange } from "../domain/report-period";
import type { ReportJob, ReportKind } from "../domain/report-job";
import type { ReportVendorLine } from "../domain/vendor-attendance-report";

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
  /** Marks the job done and records both files as stored, in one transaction. */
  markDone(
    job: ReportJob,
    files: { xlsx: ReportFile; pdf: ReportFile; fileName: string },
    at: Date,
  ): Promise<void>;
  markFailed(id: string, error: string, at: Date): Promise<void>;
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
export type ReportSource = {
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
