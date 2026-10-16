import type {
  DocumentApprovalEvent,
  DocumentApproved,
  DocumentRejected,
  DocumentSubmitted,
} from "./approval";

/**
 * Builds the generic approval events of `approval.ts` (ADR CM-0021 §6)
 * for a module's after-commit dispatch, so every document fills the same
 * fields the same way.
 */
export type ApprovalSubject = {
  workspaceId: string;
  documentType: string;
  documentId: string;
  projectId: string | null;
  /** As the screens show it ("PR-0012"), or null. */
  number: string | null;
  /** User id told of the decision: the creator, or the employee's User. */
  createdBy: string | null;
};

export type ApprovalOutcome =
  | { kind: "submitted" }
  | { kind: "approved" }
  | { kind: "rejected"; reason: string | null };

export function approvalEvent(
  subject: ApprovalSubject,
  outcome: ApprovalOutcome,
  by: string,
  at: Date,
): DocumentApprovalEvent {
  const base = {
    workspaceId: subject.workspaceId,
    occurredAt: at,
    documentType: subject.documentType,
    documentId: subject.documentId,
    projectId: subject.projectId,
    number: subject.number,
  };
  switch (outcome.kind) {
    case "submitted":
      return {
        ...base,
        type: "document.submitted",
        submittedBy: by,
      } satisfies DocumentSubmitted;
    case "approved":
      return {
        ...base,
        type: "document.approved",
        approvedBy: by,
        createdBy: subject.createdBy,
      } satisfies DocumentApproved;
    case "rejected":
      return {
        ...base,
        type: "document.rejected",
        rejectedBy: by,
        createdBy: subject.createdBy,
        reason: outcome.reason,
      } satisfies DocumentRejected;
  }
}

/** The outcome of a save: approved (Save & Approve), waiting, or none. */
export function savedOutcome(status: string): ApprovalOutcome | null {
  if (status === "approved") return { kind: "approved" };
  if (status === "pending") return { kind: "submitted" };
  return null;
}
