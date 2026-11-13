import type { OwnScope } from "@/src/shared-kernel/access";
import {
  DomainError,
  forbidden,
  notFound,
} from "@/src/shared-kernel/domain-error";

import { invalidField } from "./marketing-errors";
import {
  VISIT_LIMITS,
  VISIT_LOCK_DAYS,
  type Interest,
  type VisitPurpose,
  type VisitShownStatus,
  type VisitStatus,
  type WorkType,
} from "./marketing-terms";
import { optionalText } from "./prospect-company";

const DAY_MS = 24 * 60 * 60 * 1000;
/** `YYYY-MM`; year 0000 is not a month anyone starts work in. */
const MONTH = /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/;

function optionalLines(raw: string | null | undefined): string | null {
  const value =
    raw
      ?.split("\n")
      .map((line) => line.trimEnd())
      .join("\n")
      .trim() ?? "";
  return value === "" ? null : value;
}

function limit(
  value: string | null,
  max: number,
  code: string,
  label: string,
  field: string,
): string | null {
  if (value != null && value.length > max)
    throw invalidField(
      code,
      `Keep the ${label} to ${String(max)} characters.`,
      field,
    );
  return value;
}

export type VisitDetailsInput = {
  purpose?: VisitPurpose | null;
  location?: string | null;
  discussion?: string | null;
  outcome?: string | null;
  interest?: Interest | null;
  requirementWorkType?: WorkType | null;
  /** Whole rupees. */
  requirementValue?: number | null;
  /** `YYYY-MM`. */
  requirementStartMonth?: string | null;
};

export type VisitDetails = {
  purpose: VisitPurpose | null;
  location: string | null;
  discussion: string | null;
  outcome: string | null;
  interest: Interest | null;
  requirementWorkType: WorkType | null;
  requirementValue: number | null;
  /** `YYYY-MM`. */
  requirementStartMonth: string | null;
};

/** Checks and tidies what a Visit records (PRD §3.4). */
export function visitDetails(input: VisitDetailsInput): VisitDetails {
  const value = input.requirementValue ?? null;
  if (
    value != null &&
    (!Number.isInteger(value) || value < 0 || value > VISIT_LIMITS.value)
  )
    throw invalidField(
      "VISIT_VALUE_INVALID",
      "Enter the approximate value in whole rupees.",
      "requirementValue",
    );
  const month = optionalText(input.requirementStartMonth);
  if (month != null && !MONTH.test(month))
    throw invalidField(
      "VISIT_START_MONTH_INVALID",
      "Choose the month the work may start.",
      "requirementStartMonth",
    );
  return {
    purpose: input.purpose ?? null,
    location: limit(
      optionalText(input.location),
      VISIT_LIMITS.location,
      "VISIT_LOCATION_TOO_LONG",
      "location",
      "location",
    ),
    discussion: limit(
      optionalLines(input.discussion),
      VISIT_LIMITS.discussion,
      "VISIT_DISCUSSION_TOO_LONG",
      "discussion",
      "discussion",
    ),
    outcome: limit(
      optionalText(input.outcome),
      VISIT_LIMITS.outcome,
      "VISIT_OUTCOME_TOO_LONG",
      "outcome",
      "outcome",
    ),
    interest: input.interest ?? null,
    requirementWorkType: input.requirementWorkType ?? null,
    requirementValue: value,
    requirementStartMonth: month,
  };
}

/**
 * What a Completed Visit needs (ADR CM-0040 §7): a time not in the future,
 * at least one point of contact, and the Discussion.
 */
export function assertCompletable(input: {
  visitAt: Date;
  now: Date;
  contactCount: number;
  discussion: string | null;
}): void {
  if (input.visitAt.getTime() > input.now.getTime())
    throw invalidField(
      "VISIT_IN_FUTURE",
      "A completed Visit cannot be in the future. Plan it instead, or correct the time.",
      "visitAt",
    );
  if (input.contactCount === 0)
    throw invalidField(
      "VISIT_CONTACT_REQUIRED",
      "Add the person you met to complete the Visit.",
      "contactIds",
    );
  if (input.discussion == null)
    throw invalidField(
      "VISIT_DISCUSSION_REQUIRED",
      "Write what was discussed to complete the Visit.",
      "discussion",
    );
}

/**
 * The Marketing People on a Visit (PRD §3.4): at least one, no repeats;
 * the creator when none are given. Without View all the caller must be
 * one of them, so they cannot make a Visit they then cannot see (ADR
 * CM-0040 §5).
 */
export function visitorIds(input: {
  given: readonly string[] | undefined;
  self: string | null;
  scope: OwnScope;
}): string[] {
  const ids = [
    ...new Set(input.given ?? (input.self == null ? [] : [input.self])),
  ];
  if (ids.length === 0)
    throw invalidField(
      "VISITOR_REQUIRED",
      "Choose who is visiting.",
      "visitorIds",
    );
  if (input.scope != null && (input.self == null || !ids.includes(input.self)))
    throw invalidField(
      "VISITOR_SELF_REQUIRED",
      "Include yourself among the visitors. Only someone who sees every Visit can log one for others.",
      "visitorIds",
    );
  return ids;
}

/** Shown as Missed: Planned, and its time has passed (never stored). */
export function shownStatus(
  visit: { status: VisitStatus; visitAt: Date },
  now: Date,
): VisitShownStatus {
  return visit.status === "planned" && visit.visitAt.getTime() < now.getTime()
    ? "missed"
    : visit.status;
}

/**
 * Whether a member without View all sees a Visit (ADR CM-0040 §5): they
 * created it, or they are one of its visitors. Its notes and history go
 * with it.
 */
export function isVisitVisible(
  visit: { createdBy: string; visitorIds: readonly string[] },
  scope: OwnScope,
): boolean {
  if (scope == null) return true;
  if (visit.createdBy === scope.userId) return true;
  return scope.memberId != null && visit.visitorIds.includes(scope.memberId);
}

/**
 * Whether a Completed Visit is past its lock (ADR CM-0040 §7): its creator
 * may change it for 7 days after it was completed.
 */
export function isVisitLocked(
  visit: {
    status: VisitStatus;
    completedAt: Date | null;
    createdBy: string;
  },
  input: { userId: string; viewAll: boolean; now: Date },
): boolean {
  if (visit.status !== "completed" || input.viewAll) return false;
  if (visit.createdBy !== input.userId) return true;
  const since = visit.completedAt?.getTime() ?? 0;
  return input.now.getTime() - since > VISIT_LOCK_DAYS * DAY_MS;
}

/** 404 for a Visit that is gone or out of the viewer's scope (ADR CM-0040 §5). */
export function visitNotFound(): DomainError {
  return notFound("VISIT_NOT_FOUND", "This Visit was not found.");
}

export function visitLocked(): DomainError {
  return forbidden(
    "VISIT_LOCKED",
    `A completed Visit can be changed by the person who logged it for ${String(VISIT_LOCK_DAYS)} days. Ask someone who sees every Visit to change it. Notes can still be added.`,
  );
}

/** Planned is the only state that can move (ADR CM-0040 §7). */
export function assertPlanned(status: VisitStatus, action: string): void {
  if (status !== "planned")
    throw new DomainError(
      "VISIT_NOT_PLANNED",
      `Only a planned Visit can be ${action}.`,
      { kind: "conflict" },
    );
}

export function cancelReason(raw: string | null | undefined): string {
  const reason = optionalText(raw);
  if (reason == null)
    throw invalidField(
      "VISIT_CANCEL_REASON_REQUIRED",
      "Say why the Visit is cancelled.",
      "reason",
    );
  limit(
    reason,
    VISIT_LIMITS.cancelReason,
    "VISIT_CANCEL_REASON_TOO_LONG",
    "reason",
    "reason",
  );
  return reason;
}

export function noteText(raw: string | null | undefined): string {
  const text = optionalLines(raw);
  if (text == null)
    throw invalidField("VISIT_NOTE_REQUIRED", "Write the note.", "text");
  limit(text, VISIT_LIMITS.note, "VISIT_NOTE_TOO_LONG", "note", "text");
  return text;
}
