import {
  assertCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { conflict, DomainError } from "@/src/shared-kernel/domain-error";

import {
  isTrackingPriority,
  type TrackingPriority,
} from "./tracking-documents";

/**
 * Issues & Snags (ADR CM-0019 §7, §8, CM-803): a problem on site with its
 * priority, category, who must fix it and by when. The stored status is
 * `open`, `solved` or `closed`; **Delayed** is derived on read (open and
 * the Company's today is after the Due Date), so it never goes stale and
 * no job flips it. `issueStatusSql` (infrastructure) is the SQL twin of
 * `issueStatus` and is tested against it.
 */

export const ISSUE_STORED_STATUSES = ["open", "solved", "closed"] as const;
export type IssueStoredStatus = (typeof ISSUE_STORED_STATUSES)[number];

/** What the screens show: Pending / Delayed / Solved / Closed. */
export const ISSUE_STATUSES = [
  "pending",
  "delayed",
  "solved",
  "closed",
] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = {
  pending: "Pending",
  delayed: "Delayed",
  solved: "Solved",
  closed: "Closed",
};

export function isIssueStatus(value: string): value is IssueStatus {
  return (ISSUE_STATUSES as readonly string[]).includes(value);
}

export const ISSUE_LIMITS = {
  details: 4000,
  /** A Progress update's comment. */
  updateBody: 4000,
  reopenReason: 1000,
  /** Ids in one bulk Mark As Solved / Verify. */
  bulk: 200,
  /** The author may delete their own update for this long (CM-0019 §7). */
  updateDeleteWindowMs: 24 * 60 * 60 * 1000,
} as const;

/**
 * The status shown for an issue on `today` (the Company's): an open issue
 * is **Delayed** once today is after its Due Date, else **Pending**; an
 * open issue without a Due Date is never delayed.
 */
export function issueStatus(
  issue: { status: IssueStoredStatus; dueDate: CalendarDate | null },
  today: CalendarDate,
): IssueStatus {
  if (issue.status !== "open") return issue.status;
  return issue.dueDate != null && today > issue.dueDate ? "delayed" : "pending";
}

/** The stored status a shown status filters on (Pending and Delayed are both `open`). */
export function storedStatusOf(status: IssueStatus): IssueStoredStatus {
  return status === "pending" || status === "delayed" ? "open" : status;
}

export type IssueInput = {
  issueDate: string;
  details: string;
  priority?: string | null;
  dueDate?: string | null;
};

/** The checked own fields of an issue (references are checked by the handler). */
export type IssueFields = {
  issueDate: CalendarDate;
  details: string;
  priority: TrackingPriority | null;
  dueDate: CalendarDate | null;
};

function date(raw: string, field: string): CalendarDate {
  try {
    return assertCalendarDate(raw.trim(), "ISSUE_DATE_INVALID");
  } catch {
    throw new DomainError("ISSUE_DATE_INVALID", "Enter a date as YYYY-MM-DD.", {
      details: { field },
    });
  }
}

/**
 * Checks and normalises an issue's own fields (CM-0019 §7): Issue Date
 * not after today, Details required, Priority High / Medium / Low or none,
 * Due Date on or after the Issue Date. The back-dated policy on the Issue
 * Date is the handler's (it needs the policy and the actor).
 */
export function issueFields(
  input: IssueInput,
  today: CalendarDate,
): IssueFields {
  if (input.issueDate.trim() === "")
    throw new DomainError("ISSUE_DATE_REQUIRED", "Choose the Issue Date.", {
      details: { field: "issueDate" },
    });
  const issueDate = date(input.issueDate, "issueDate");
  if (issueDate > today)
    throw new DomainError(
      "ISSUE_DATE_IN_FUTURE",
      "The Issue Date cannot be after today.",
      { details: { field: "issueDate" } },
    );
  const details = input.details.trim();
  if (details === "")
    throw new DomainError("ISSUE_DETAILS_REQUIRED", "Describe the issue.", {
      details: { field: "details" },
    });
  if (details.length > ISSUE_LIMITS.details)
    throw new DomainError(
      "TEXT_TOO_LONG",
      `Use at most ${String(ISSUE_LIMITS.details)} characters.`,
      { details: { field: "details" } },
    );
  const rawPriority = input.priority?.trim() ?? "";
  if (rawPriority !== "" && !isTrackingPriority(rawPriority))
    throw new DomainError(
      "ISSUE_PRIORITY_INVALID",
      "Choose High, Medium or Low.",
      { details: { field: "priority" } },
    );
  const rawDue = input.dueDate?.trim() ?? "";
  const dueDate = rawDue === "" ? null : date(rawDue, "dueDate");
  if (dueDate != null && dueDate < issueDate)
    throw new DomainError(
      "ISSUE_DUE_BEFORE_ISSUE_DATE",
      "The Due Date cannot be before the Issue Date.",
      { details: { field: "dueDate" } },
    );
  return {
    issueDate,
    details,
    priority: rawPriority === "" ? null : rawPriority,
    dueDate,
  };
}

// ---------------------------------------------------------------------------
// Transitions (CM-0019 §8). Each refusal is a 409 the screen can show.
// ---------------------------------------------------------------------------

export type IssueTransition = "solve" | "verify" | "reopen";

/** Whether `transition` applies to an issue in `status` (bulk skips the rest). */
export function canTransition(
  status: IssueStoredStatus,
  transition: IssueTransition,
): boolean {
  switch (transition) {
    case "solve":
      return status === "open";
    case "verify":
      return status === "solved";
    case "reopen":
      return status === "solved" || status === "closed";
  }
}

const REFUSALS: Record<IssueTransition, { code: string; message: string }> = {
  solve: {
    code: "ISSUE_NOT_OPEN",
    message: "Only a Pending or Delayed issue can be marked as solved.",
  },
  verify: {
    code: "ISSUE_NOT_SOLVED",
    message: "Only a solved issue can be verified.",
  },
  reopen: {
    code: "ISSUE_NOT_RESOLVED",
    message: "Only a solved or closed issue can be reopened.",
  },
};

/** Throws 409 when `transition` does not apply to an issue in `status`. */
export function assertTransition(
  status: IssueStoredStatus,
  transition: IssueTransition,
): void {
  if (canTransition(status, transition)) return;
  const refusal = REFUSALS[transition];
  throw conflict(refusal.code, refusal.message, { status });
}

/** Editing is offered only while the issue is open (Pending or Delayed). */
export function assertEditable(status: IssueStoredStatus): void {
  if (status !== "open")
    throw conflict(
      "ISSUE_NOT_OPEN",
      "Only a Pending or Delayed issue can be edited. Reopen it first.",
      { status },
    );
}

/** Reopen needs a reason (CM-0019 §8): trimmed, not empty. */
export function reopenReason(raw: string | null | undefined): string {
  const reason = raw?.trim() ?? "";
  if (reason === "")
    throw new DomainError(
      "ISSUE_REOPEN_REASON_REQUIRED",
      "Say why the issue is reopened.",
      { details: { field: "reason" } },
    );
  if (reason.length > ISSUE_LIMITS.reopenReason)
    throw new DomainError(
      "TEXT_TOO_LONG",
      `Use at most ${String(ISSUE_LIMITS.reopenReason)} characters.`,
      { details: { field: "reason" } },
    );
  return reason;
}

// ---------------------------------------------------------------------------
// The Progress thread (CM-0019 §7)
// ---------------------------------------------------------------------------

/**
 * A Progress update's comment: optional when it carries images, at most
 * `ISSUE_LIMITS.updateBody` characters; an update with neither is refused.
 */
export function updateBody(
  raw: string | null | undefined,
  withImages: boolean,
): string | null {
  const body = raw?.trim() ?? "";
  if (body.length > ISSUE_LIMITS.updateBody)
    throw new DomainError(
      "TEXT_TOO_LONG",
      `Use at most ${String(ISSUE_LIMITS.updateBody)} characters.`,
      { details: { field: "body" } },
    );
  if (body === "" && !withImages)
    throw new DomainError(
      "ISSUE_UPDATE_EMPTY",
      "Write a comment or add images.",
      { details: { field: "body" } },
    );
  return body === "" ? null : body;
}

/**
 * Only the author may delete an update, within 24 hours of posting it
 * (the thread is a log; nothing is edited).
 */
export function canDeleteUpdate(
  update: { createdBy: string; createdAt: Date },
  userId: string,
  now: Date,
): boolean {
  return (
    update.createdBy === userId &&
    now.getTime() - update.createdAt.getTime() <
      ISSUE_LIMITS.updateDeleteWindowMs
  );
}

export function assertCanDeleteUpdate(
  update: { createdBy: string; createdAt: Date },
  userId: string,
  now: Date,
): void {
  if (update.createdBy !== userId)
    throw new DomainError(
      "ISSUE_UPDATE_NOT_YOURS",
      "Only the person who posted an update can delete it.",
      { kind: "forbidden" },
    );
  if (!canDeleteUpdate(update, userId, now))
    throw conflict(
      "ISSUE_UPDATE_TOO_OLD",
      "An update can be deleted only within 24 hours of posting it.",
    );
}

/** The lifecycle history kinds (`issue_events.kind`). */
export const ISSUE_EVENT_KINDS = [
  "created",
  "edited",
  "assigned",
  "solved",
  "closed",
  "reopened",
] as const;
export type IssueEventKind = (typeof ISSUE_EVENT_KINDS)[number];
