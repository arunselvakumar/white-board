import type { DomainEvent } from "@/src/shared-kernel/events";

import type { ReportKind } from "./report-job";

/**
 * Reporting events (ADR CM-0021 §6), raised after a job finishes so
 * messaging can tell its requester. Append-only: CM-906 adds backup events
 * below.
 */

/** A report job is done (its files stored) or failed. */
export type ReportFinished = DomainEvent & {
  type: "ReportFinished";
  reportJobId: string;
  kind: ReportKind;
  /** Null for a central report. */
  projectId: string | null;
  /** User id of who asked for it: the only recipient. */
  requestedBy: string;
  status: "done" | "failed";
  /** Download name without extension when done. */
  fileName: string | null;
  /** The failure message when failed. */
  error: string | null;
};

/**
 * A backup or data export is done (its ZIP stored, a 7-day signed link
 * ready) or failed (CM-906). `workspaceId` is the Company it was asked
 * in: for Download My Data, the requester's Active Company at the time,
 * so the notification lands there.
 */
export type BackupFinished = DomainEvent & {
  type: "BackupFinished";
  backupJobId: string;
  scope: "project" | "masters" | "company" | "my_data";
  projectId: string | null;
  /** User id of who asked for it: the only recipient. */
  requestedBy: string;
  status: "done" | "failed";
  /** "Project backup", "My data", … */
  title: string;
  /** The ZIP's name when done. */
  fileName: string | null;
  /** The signed download link (7 days) when done. */
  downloadHref: string | null;
  /** The failure message when failed. */
  error: string | null;
};
