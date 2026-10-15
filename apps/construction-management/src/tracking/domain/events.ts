import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import type { DomainEvent } from "@/src/shared-kernel/events";

/**
 * Tracking events (ADR CM-0019 §11). Raised after commit through an
 * in-process dispatcher; nothing listens until M9's notifications. They
 * carry the ids M9 needs to notify the people `modules/05` names.
 *
 * Append-only: each M8 ticket adds its events below its own heading.
 */

// ---------------------------------------------------------------------------
// Tasks (CM-802)
// ---------------------------------------------------------------------------

/** Team Members were added to a task's Assign To (on create or edit). */
export type TaskAssigned = DomainEvent & {
  type: "TaskAssigned";
  taskId: string;
  projectId: string;
  taskNo: number;
  /** The newly added Team Member ids. */
  memberIds: readonly string[];
  /** User id of who assigned them. */
  by: string;
  /** User id of the task's creator. */
  createdBy: string;
};

/** A progress update was recorded or edited on a leaf task. */
export type TaskProgressRecorded = DomainEvent & {
  type: "TaskProgressRecorded";
  taskId: string;
  projectId: string;
  taskNo: number;
  progressId: string;
  progressDate: CalendarDate;
  /** The task's progress after the update, a percentage. */
  progressPct: number;
  by: string;
  createdBy: string;
  assigneeMemberIds: readonly string[];
};

/** A leaf task reached 100 % (Mark As Completed or an update). */
export type TaskCompleted = DomainEvent & {
  type: "TaskCompleted";
  taskId: string;
  projectId: string;
  taskNo: number;
  actualEnd: CalendarDate;
  by: string;
  createdBy: string;
  assigneeMemberIds: readonly string[];
};

export type TaskEvent = TaskAssigned | TaskProgressRecorded | TaskCompleted;

// ---------------------------------------------------------------------------
// Issues & Snags (CM-803)
// ---------------------------------------------------------------------------

/** What every issue event carries: who to notify is the assignee and the creator. */
type IssueEventBase = DomainEvent & {
  issueId: string;
  projectId: string;
  number: string;
  /** User id of who raised the issue (`created_by`). */
  createdBy: string;
  /** Team Member id, or null. */
  assigneeMemberId: string | null;
  /** User id of who did it. */
  by: string;
};

/** An issue was raised with an assignee, or its assignee changed to someone. */
export type IssueAssigned = IssueEventBase & { type: "IssueAssigned" };

/** A Progress update (comment and/or images) was posted on an issue. */
export type IssueUpdated = IssueEventBase & {
  type: "IssueUpdated";
  updateId: string;
};

/** An issue was marked as solved (or raised solved). */
export type IssueSolved = IssueEventBase & { type: "IssueSolved" };

/** A solved or closed issue was reopened, with the reason. */
export type IssueReopened = IssueEventBase & {
  type: "IssueReopened";
  reason: string;
};

export type IssueEvent =
  IssueAssigned | IssueUpdated | IssueSolved | IssueReopened;

// ---------------------------------------------------------------------------
// CM-804 Inspection Requests
// ---------------------------------------------------------------------------

/**
 * A request was raised (or raised again as a re-inspection). M9 notifies
 * the inspector.
 */
export type InspectionRequested = DomainEvent & {
  type: "InspectionRequested";
  inspectionId: string;
  projectId: string;
  number: string;
  /** Team Member id; null when no inspector was named. */
  inspectorMemberId: string | null;
  /** The rejected request this one re-inspects. */
  reinspectionOfId: string | null;
  /** User id of who raised it. */
  requestedBy: string;
};

/**
 * A request was approved or rejected (singly or in bulk). M9 notifies the
 * person who raised it (`requestedBy`).
 */
export type InspectionDecided = DomainEvent & {
  type: "InspectionDecided";
  inspectionId: string;
  projectId: string;
  number: string;
  status: "approved" | "rejected";
  reason: string | null;
  /** User id of who decided. */
  decidedBy: string;
  /** User id of who raised the request. */
  requestedBy: string;
  /** The snag raised with the rejection, when one was. */
  snagIssueId: string | null;
};
