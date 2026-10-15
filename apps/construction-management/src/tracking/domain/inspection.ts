import {
  approve,
  reject,
  type ApprovalState,
  type Decider,
} from "@/src/shared-kernel/approval";
import {
  isCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { conflict, DomainError } from "@/src/shared-kernel/domain-error";
import type { LocationRef } from "@/src/shared-kernel/location-ref";

import { TRACKING_DOCUMENTS } from "./tracking-documents";

/**
 * Inspection Requests (CM-804, ADR CM-0019 §9, §10): a numbered request
 * from site asking an inspector to check work at a location. It is
 * **Pending for approval** until someone with Approve approves it or
 * someone with Reject rejects it with a reason; a decided request is final
 * and read-only except for remarks. A rejected one can be followed by a
 * **re-inspection** (a new request linked to it) and, on rejecting, by a
 * **snag** (an Issue & Snag raised in the same transaction).
 */

export const INSPECTION_STATUSES = ["pending", "approved", "rejected"] as const;
export type InspectionStatus = (typeof INSPECTION_STATUSES)[number];

/** Screen words (`modules/05` "Inspection Request screens"). */
export const INSPECTION_STATUS_LABELS: Record<InspectionStatus, string> = {
  pending: "Pending for approval",
  approved: "Approved",
  rejected: "Rejected",
};

export function isInspectionStatus(value: string): value is InspectionStatus {
  return (INSPECTION_STATUSES as readonly string[]).includes(value);
}

/** `{ code: "INSPECTION", label: "Inspection Request" }`. */
export const INSPECTION_NAMING = TRACKING_DOCUMENTS.inspection.naming;

export const INSPECTION_LIMITS = {
  workDescription: 2000,
  observation: 2000,
  remark: 500,
  /** Project Drawings linked to one request. */
  drawings: 50,
} as const;

/** The Issue Category a snag from a rejection gets (seed name, CM-0019 §10). */
export const SNAG_CATEGORY_NAME = "Quality";

function tooLong(field: string, max: number): DomainError {
  return new DomainError(
    "TEXT_TOO_LONG",
    `Use at most ${String(max)} characters.`,
    { details: { field } },
  );
}

function optionalId(raw: string | null | undefined): string | null {
  const id = raw?.trim() ?? "";
  return id === "" ? null : id;
}

/** Inspection Time: `HH:MM` (24-hour, local time on site), or null. */
export function inspectionTime(raw: string | null | undefined): string | null {
  const text = raw?.trim() ?? "";
  if (text === "") return null;
  const match = /^(\d{2}):(\d{2})$/.exec(text);
  if (match == null || Number(match[1]) > 23 || Number(match[2]) > 59)
    throw new DomainError(
      "INSPECTION_TIME_INVALID",
      "Enter the time as HH:MM, for example 14:30.",
      { details: { field: "inspectionTime" } },
    );
  return text;
}

export type InspectionInput = {
  inspectionDate: string;
  inspectionTime?: string | null;
  departmentId?: string | null;
  contractorId?: string | null;
  inspectorMemberId?: string | null;
  workDescription: string;
  drawingIds?: readonly string[] | null;
};

/** A request's own fields, checked; references are checked by the handler. */
export type InspectionFields = {
  inspectionDate: CalendarDate;
  /** `HH:MM`. */
  inspectionTime: string | null;
  departmentId: string | null;
  contractorId: string | null;
  /** A Team Member id (not a User id). */
  inspectorMemberId: string | null;
  workDescription: string;
  /** Unique, in the order given. */
  drawingIds: string[];
};

/**
 * Checks and normalises a request's fields. The Inspection Date may be in
 * the future (a request is often raised for a visit tomorrow); the
 * back-dated policy limits how far back it may go.
 */
export function inspectionFields(input: InspectionInput): InspectionFields {
  const date = input.inspectionDate.trim();
  if (!isCalendarDate(date))
    throw new DomainError(
      "INSPECTION_DATE_INVALID",
      "Choose the inspection date.",
      { details: { field: "inspectionDate" } },
    );
  const workDescription = input.workDescription.trim();
  if (workDescription === "")
    throw new DomainError(
      "INSPECTION_DESCRIPTION_REQUIRED",
      "Describe the work to inspect.",
      { details: { field: "workDescription" } },
    );
  if (workDescription.length > INSPECTION_LIMITS.workDescription)
    throw tooLong("workDescription", INSPECTION_LIMITS.workDescription);
  const drawingIds = [
    ...new Set((input.drawingIds ?? []).map((id) => id.trim())),
  ].filter((id) => id !== "");
  if (drawingIds.length > INSPECTION_LIMITS.drawings)
    throw new DomainError(
      "INSPECTION_TOO_MANY_DRAWINGS",
      `Link at most ${String(INSPECTION_LIMITS.drawings)} drawings.`,
      { details: { field: "drawingIds" } },
    );
  return {
    inspectionDate: date,
    inspectionTime: inspectionTime(input.inspectionTime),
    departmentId: optionalId(input.departmentId),
    contractorId: optionalId(input.contractorId),
    inspectorMemberId: optionalId(input.inspectorMemberId),
    workDescription,
    drawingIds,
  };
}

/**
 * 409 `INSPECTION_DECIDED`: an approved or rejected request is final. It
 * cannot be edited or deleted, and takes no more observations; remarks
 * stay open (CM-0019 §9).
 */
export function assertPending(
  status: InspectionStatus,
  what: "edit" | "delete" | "observe",
): void {
  if (status === "pending") return;
  const verb =
    what === "edit"
      ? "edited"
      : what === "delete"
        ? "deleted"
        : "given observations";
  throw conflict(
    "INSPECTION_DECIDED",
    `This Inspection Request is ${INSPECTION_STATUS_LABELS[status].toLowerCase()}; it can no longer be ${verb}.`,
    { status },
  );
}

export type InspectionDecision =
  { approve: true } | { approve: false; reason: string };

/**
 * Approve or Reject a pending request (the kernel's approval step): 409
 * `INSPECTION_NOT_PENDING` once decided; 400 `REJECTION_REASON_REQUIRED`
 * for a reject without a reason.
 */
export function decideInspection(
  state: ApprovalState,
  decision: InspectionDecision,
  by: Decider,
): ApprovalState {
  return decision.approve
    ? approve(state, by, INSPECTION_NAMING)
    : reject(state, by, decision.reason, INSPECTION_NAMING);
}

/**
 * An observation's text: optional when files come with it, required
 * otherwise; trimmed, at most 2,000 characters.
 */
export function observationBody(
  raw: string | null | undefined,
  withFiles: boolean,
): string | null {
  const text = raw?.trim() ?? "";
  if (text.length > INSPECTION_LIMITS.observation)
    throw tooLong("body", INSPECTION_LIMITS.observation);
  if (text === "" && !withFiles)
    throw new DomainError(
      "OBSERVATION_EMPTY",
      "Write the observation, or add a photo or file.",
      { details: { field: "body" } },
    );
  return text === "" ? null : text;
}

/** A remark: required, trimmed, at most 500 characters. */
export function remarkBody(raw: string | null | undefined): string {
  const text = raw?.trim() ?? "";
  if (text === "")
    throw new DomainError("REMARK_EMPTY", "Write the remark.", {
      details: { field: "body" },
    });
  if (text.length > INSPECTION_LIMITS.remark)
    throw tooLong("body", INSPECTION_LIMITS.remark);
  return text;
}

/**
 * **Raise re-inspection** needs a rejected request of the same Project:
 * 409 `INSPECTION_NOT_REJECTED` otherwise, 400
 * `REINSPECTION_PROJECT_MISMATCH` for another Project's.
 */
export function assertReinspectable(
  original: { status: InspectionStatus; projectId: string },
  projectId: string,
): void {
  if (original.projectId !== projectId)
    throw new DomainError(
      "REINSPECTION_PROJECT_MISMATCH",
      "A re-inspection is raised on the same Project as the rejected request.",
      { details: { field: "reinspectionOfId" } },
    );
  if (original.status !== "rejected")
    throw conflict(
      "INSPECTION_NOT_REJECTED",
      "Only a rejected Inspection Request can be inspected again.",
      { status: original.status },
    );
}

/** What a re-inspection copies from the rejected request (CM-0019 §10). */
export type ReinspectionDraft = {
  reinspectionOfId: string;
  departmentId: string | null;
  contractorId: string | null;
  inspectorMemberId: string | null;
  workDescription: string;
  siteLocation: LocationRef | null;
  drawingIds: string[];
};

/**
 * The new request's prefill: department, contractor, inspector,
 * description, location and linked drawings — not the date, time, files,
 * observations or remarks.
 */
export function reinspectionDraft(original: {
  id: string;
  departmentId: string | null;
  contractorId: string | null;
  inspectorMemberId: string | null;
  workDescription: string;
  siteLocation: LocationRef | null;
  drawingIds: readonly string[];
}): ReinspectionDraft {
  return {
    reinspectionOfId: original.id,
    departmentId: original.departmentId,
    contractorId: original.contractorId,
    inspectorMemberId: original.inspectorMemberId,
    workDescription: original.workDescription,
    siteLocation: original.siteLocation,
    drawingIds: [...original.drawingIds],
  };
}

/** The snag's Details: "Inspection IR/26-27/00001 rejected: <reason>". */
export function snagDetails(number: string, reason: string): string {
  return `Inspection ${number} rejected: ${reason}`;
}

/**
 * The Success Rate (CM-0019 §14): Approved ÷ (Approved + Rejected) as a
 * percentage, 0–100, unrounded; `null` when nothing is decided (the
 * dashboard shows "—"). Pending requests have no outcome and do not count.
 */
export function successRate(approved: number, rejected: number): number | null {
  const decided = approved + rejected;
  if (decided <= 0) return null;
  return (approved / decided) * 100;
}
