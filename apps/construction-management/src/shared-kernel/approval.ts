import { conflict, DomainError } from "./domain-error";
import type { DomainEvent } from "./events";

/**
 * Approval behaviour shared by business documents (`03-target-architecture`
 * "Documents, numbering, approval"; ADR CM-0015 §2). A document keeps its
 * approval status apart from its fulfilment status; one approver decides
 * (multi-level approval is not built). The aggregate owns its richer
 * states; this module owns the pending → approved | rejected step, the
 * reason and remark rules and the bulk outcome shape.
 */

export const APPROVAL_STATUSES = ["pending", "approved", "rejected"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const APPROVAL_LIMITS = {
  /** Reasons, remarks and comments. */
  maxTextLength: 500,
  /** Documents in one bulk approve or reject. */
  maxBulk: 100,
} as const;

export type ApprovalState = {
  status: ApprovalStatus;
  decidedAt: Date | null;
  decidedBy: string | null;
  rejectionReason: string | null;
};

export type Decider = { userId: string; at: Date };

/**
 * What a document calls itself in codes and messages: `{ code:
 * "PURCHASE_ORDER", label: "Purchase Order" }` gives
 * `PURCHASE_ORDER_NOT_PENDING` and "This Purchase Order is not pending".
 */
export type DocumentNaming = { code: string; label: string };

export function pendingState(): ApprovalState {
  return {
    status: "pending",
    decidedAt: null,
    decidedBy: null,
    rejectionReason: null,
  };
}

/** Save & Approve: born approved. */
export function approvedState(by: Decider): ApprovalState {
  return {
    status: "approved",
    decidedAt: by.at,
    decidedBy: by.userId,
    rejectionReason: null,
  };
}

function assertPending(state: ApprovalState, naming: DocumentNaming): void {
  if (state.status !== "pending")
    throw conflict(
      `${naming.code}_NOT_PENDING`,
      `This ${naming.label} is ${state.status}, not pending.`,
      { status: state.status },
    );
}

export function approve(
  state: ApprovalState,
  by: Decider,
  naming: DocumentNaming,
): ApprovalState {
  assertPending(state, naming);
  return approvedState(by);
}

export function reject(
  state: ApprovalState,
  by: Decider,
  reason: string,
  naming: DocumentNaming,
): ApprovalState {
  assertPending(state, naming);
  return {
    status: "rejected",
    decidedAt: by.at,
    decidedBy: by.userId,
    rejectionReason: requiredText(
      reason,
      "REJECTION_REASON_REQUIRED",
      "reason",
    ),
  };
}

/** Back to pending after an edit (a rejected or approved, unfulfilled document). */
export function resubmitted(): ApprovalState {
  return pendingState();
}

function tooLong(field: string): DomainError {
  return new DomainError(
    "TEXT_TOO_LONG",
    `Use at most ${String(APPROVAL_LIMITS.maxTextLength)} characters.`,
    { details: { field } },
  );
}

/** A reason, remark or comment that must be given: trimmed, ≤ 500. */
export function requiredText(
  raw: string | null | undefined,
  code: string,
  field: string,
): string {
  const text = raw?.trim() ?? "";
  if (text === "")
    throw new DomainError(code, "Write a few words.", { details: { field } });
  if (text.length > APPROVAL_LIMITS.maxTextLength) throw tooLong(field);
  return text;
}

/** An optional remark: trimmed, empty is null, ≤ 500. */
export function optionalText(
  raw: string | null | undefined,
  field: string,
): string | null {
  const text = raw?.trim() ?? "";
  if (text.length > APPROVAL_LIMITS.maxTextLength) throw tooLong(field);
  return text === "" ? null : text;
}

/** Ids of one bulk approve or reject: 1–100, no repeats. */
export function bulkIds(ids: readonly string[]): string[] {
  const unique = [...new Set(ids)];
  if (unique.length === 0)
    throw new DomainError("BULK_EMPTY", "Choose at least one.");
  if (unique.length > APPROVAL_LIMITS.maxBulk)
    throw new DomainError(
      "BULK_TOO_MANY",
      `Choose at most ${String(APPROVAL_LIMITS.maxBulk)} at a time.`,
    );
  return unique;
}

/**
 * Bulk decisions are all or none, in one transaction: when any document
 * refuses, nothing changes and the 409 lists each refusal by id.
 */
export type BulkRefusal = { id: string; code: string; message: string };

export function bulkRefused(refusals: readonly BulkRefusal[]): DomainError {
  return conflict(
    "BULK_DECISION_REFUSED",
    refusals.length === 1
      ? "One of them cannot be decided; nothing was changed."
      : `${String(refusals.length)} of them cannot be decided; nothing was changed.`,
    { refusals },
  );
}

/** Raised when any document is approved (`03-target-architecture`). */
export type DocumentApproved = DomainEvent & {
  type: "document.approved";
  documentType: string;
  documentId: string;
  projectId: string | null;
  approvedBy: string;
};
