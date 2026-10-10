import {
  addDays,
  assertCalendarDate,
  daysBetween,
  isCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import {
  conflict,
  DomainError,
  forbidden,
} from "@/src/shared-kernel/domain-error";

import { sumDays } from "./leave-days";
import type { LeaveLedgerKind } from "./leave-balance";
import type { LeaveType } from "./leave-type";

/**
 * A leave application (CM-312, `modules/10` "LeaveRequest", workflow 5,
 * ADR CM-0012 §5, §8, §10). Its days skip holidays and week offs; each day
 * is Full (1) or Morning / Afternoon (0.5). States:
 *
 *   pending → approved | rejected | withdrawn
 *   approved → cancellation_requested → cancelled | approved
 *
 * A type that needs no approval is approved at once, and its cancellation
 * is immediate. Every transition names the ledger entries it posts.
 */

export const LEAVE_SESSIONS = ["full", "morning", "afternoon"] as const;

export type LeaveSession = (typeof LEAVE_SESSIONS)[number];

export const LEAVE_SESSION_LABELS: Record<LeaveSession, string> = {
  full: "Full day",
  morning: "Morning",
  afternoon: "Afternoon",
};

export const LEAVE_REQUEST_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "withdrawn",
  "cancellation_requested",
  "cancelled",
] as const;

export type LeaveRequestStatus = (typeof LEAVE_REQUEST_STATUSES)[number];

export const LEAVE_REQUEST_STATUS_LABELS: Record<LeaveRequestStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  cancellation_requested: "Cancellation requested",
  cancelled: "Cancelled",
};

/** Statuses that hold days: they block overlapping requests and count as leave. */
export const LIVE_LEAVE_STATUSES: readonly LeaveRequestStatus[] = [
  "pending",
  "approved",
  "cancellation_requested",
];

export const LEAVE_REQUEST_LIMITS = {
  minReasonLength: 10,
  maxReasonLength: 1000,
  maxRemarksLength: 1000,
  /** The most calendar days from the first date to the last. */
  maxSpanDays: 366,
} as const;

export function sessionDays(session: LeaveSession): 1 | 0.5 {
  return session === "full" ? 1 : 0.5;
}

export function isLeaveSession(value: string): value is LeaveSession {
  return (LEAVE_SESSIONS as readonly string[]).includes(value);
}

/** What a date is for the member (from the `WorkCalendar` port). */
export type LeaveCalendarDay = {
  date: CalendarDate;
  kind: "working" | "week_off" | "holiday";
};

export type LeaveDayPlan = Readonly<{
  date: CalendarDate;
  session: LeaveSession;
}>;

export type LeaveDaysPlan = Readonly<{
  days: readonly LeaveDayPlan[];
  /** Dates in the range that are not leave days, and why. */
  skipped: readonly { date: CalendarDate; kind: "week_off" | "holiday" }[];
  total: number;
}>;

function invalid(
  code: string,
  message: string,
  field: string,
  extra: Record<string, unknown> = {},
): DomainError {
  return new DomainError(code, message, { details: { field, ...extra } });
}

/** Checks the date range: real dates, `to` not before `from`, at most a year. */
export function assertLeaveRange(from: string, to: string): void {
  if (!isCalendarDate(from))
    throw invalid("LEAVE_DATE_INVALID", "Choose the first day.", "fromDate");
  if (!isCalendarDate(to))
    throw invalid("LEAVE_DATE_INVALID", "Choose the last day.", "toDate");
  if (to < from)
    throw invalid(
      "LEAVE_TO_BEFORE_FROM",
      "The last day cannot be before the first day.",
      "toDate",
    );
  if (daysBetween(from, to) + 1 > LEAVE_REQUEST_LIMITS.maxSpanDays)
    throw invalid(
      "LEAVE_RANGE_TOO_LONG",
      `A request covers at most ${String(LEAVE_REQUEST_LIMITS.maxSpanDays)} days.`,
      "toDate",
    );
}

/** Every date from `from` to `to`, inclusive. */
export function datesBetween(
  from: CalendarDate,
  to: CalendarDate,
): CalendarDate[] {
  assertCalendarDate(from);
  const count = daysBetween(from, to) + 1;
  return Array.from({ length: Math.max(0, count) }, (_, index) =>
    addDays(from, index),
  );
}

/**
 * The day breakdown (ADR CM-0012 §10): each working date of the range,
 * Full unless the caller chose Morning or Afternoon; holidays and week
 * offs are skipped. A session for a date outside the range or on a day
 * off is refused. No working day in the range is 400
 * `LEAVE_NO_WORKING_DAYS`.
 */
export function planLeaveDays(input: {
  calendar: readonly LeaveCalendarDay[];
  sessions?: Readonly<Record<string, string>>;
}): LeaveDaysPlan {
  const byDate = new Map(input.calendar.map((day) => [day.date, day]));
  for (const [date, session] of Object.entries(input.sessions ?? {})) {
    const day = byDate.get(date);
    if (day == null || day.kind !== "working")
      throw invalid(
        "LEAVE_DAY_NOT_WORKING",
        `${date} is not a working day in this request.`,
        "days",
        { date },
      );
    if (!isLeaveSession(session))
      throw invalid(
        "LEAVE_SESSION_INVALID",
        "Each day is Full day, Morning or Afternoon.",
        "days",
        { date },
      );
  }
  const days: LeaveDayPlan[] = [];
  const skipped: { date: CalendarDate; kind: "week_off" | "holiday" }[] = [];
  for (const day of input.calendar) {
    if (day.kind !== "working") {
      skipped.push({ date: day.date, kind: day.kind });
      continue;
    }
    const chosen = input.sessions?.[day.date];
    days.push(
      Object.freeze({
        date: day.date,
        session: chosen != null && isLeaveSession(chosen) ? chosen : "full",
      }),
    );
  }
  const total = sumDays(days.map((day) => sessionDays(day.session)));
  if (total <= 0)
    throw invalid(
      "LEAVE_NO_WORKING_DAYS",
      "Every day in this range is a holiday or a week off.",
      "fromDate",
    );
  return Object.freeze({
    days: Object.freeze(days),
    skipped: Object.freeze(skipped),
    total,
  });
}

/** Trims the reason and checks its length (at least 10 characters). */
export function leaveReason(raw: string): string {
  const reason = raw.trim();
  if (reason.length < LEAVE_REQUEST_LIMITS.minReasonLength)
    throw invalid(
      "LEAVE_REASON_TOO_SHORT",
      `Write a reason of at least ${String(LEAVE_REQUEST_LIMITS.minReasonLength)} characters.`,
      "reason",
    );
  if (reason.length > LEAVE_REQUEST_LIMITS.maxReasonLength)
    throw invalid(
      "LEAVE_REASON_TOO_LONG",
      `Use at most ${String(LEAVE_REQUEST_LIMITS.maxReasonLength)} characters.`,
      "reason",
    );
  return reason;
}

/** An active type, and a request within its most days in one request. */
export function assertTypeAllows(
  type: Pick<LeaveType, "name" | "isActive" | "maxConsecutiveDays">,
  total: number,
): void {
  if (!type.isActive)
    throw invalid(
      "LEAVE_TYPE_INACTIVE",
      `${type.name} is no longer offered.`,
      "leaveTypeId",
    );
  if (type.maxConsecutiveDays != null && total > type.maxConsecutiveDays)
    throw invalid(
      "LEAVE_MAX_CONSECUTIVE_EXCEEDED",
      `${type.name} allows at most ${String(type.maxConsecutiveDays)} days in one request; this one has ${String(total)}.`,
      "toDate",
      { maxConsecutiveDays: type.maxConsecutiveDays, requested: total },
    );
}

/**
 * Whether two requests share a moment: the same date with either a full
 * day or the same half. A morning and an afternoon on one date do not
 * overlap.
 */
export function overlappingDates(
  wanted: readonly LeaveDayPlan[],
  taken: readonly LeaveDayPlan[],
): CalendarDate[] {
  const byDate = new Map<string, LeaveSession[]>();
  for (const day of taken)
    byDate.set(day.date, [...(byDate.get(day.date) ?? []), day.session]);
  return wanted
    .filter((day) =>
      (byDate.get(day.date) ?? []).some(
        (session) =>
          session === "full" ||
          day.session === "full" ||
          session === day.session,
      ),
    )
    .map((day) => day.date);
}

export function assertNoOverlap(
  wanted: readonly LeaveDayPlan[],
  taken: readonly LeaveDayPlan[],
): void {
  const dates = overlappingDates(wanted, taken);
  if (dates.length > 0)
    throw new DomainError(
      "LEAVE_OVERLAPS",
      `There is already leave on ${dates.slice(0, 3).join(", ")}${dates.length > 3 ? "…" : ""}. Withdraw or cancel it first.`,
      { kind: "conflict", details: { field: "fromDate", dates } },
    );
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

/** A ledger entry a transition posts, signed (ADR CM-0004). */
export type LeavePosting = Readonly<{
  kind: Extract<LeaveLedgerKind, "used" | "reserved" | "released" | "restored">;
  days: number;
}>;

export type LeaveRequestState = Readonly<{
  memberId: string;
  status: LeaveRequestStatus;
  approvalLevels: number;
  currentLevel: number;
  totalDays: number;
  /** Who decided each level of the request stage so far. */
  levelDeciders: readonly { level: number; memberId: string | null }[];
}>;

export type LeaveTransition = Readonly<{
  status: LeaveRequestStatus;
  currentLevel: number;
  postings: readonly LeavePosting[];
}>;

/** Who decides: their Team Member id (null if none) and whether they are the Owner. */
export type LeaveDecider = { memberId: string | null; isOwner: boolean };

/**
 * A new request (CM-312): approved at once with `used` when the type needs
 * no approval (`levels` 0), else pending at level 1 with `reserved`.
 */
export function applyTransition(
  levels: 0 | 1 | 2,
  totalDays: number,
): LeaveTransition & { approvalLevels: 1 | 2 } {
  if (levels === 0)
    return {
      status: "approved",
      approvalLevels: 1,
      currentLevel: 1,
      postings: [{ kind: "used", days: -totalDays }],
    };
  return {
    status: "pending",
    approvalLevels: levels,
    currentLevel: 1,
    postings: [{ kind: "reserved", days: -totalDays }],
  };
}

function notInState(expected: string): DomainError {
  return conflict(
    "LEAVE_REQUEST_STATE_CHANGED",
    `This request is no longer ${expected}. Reload to see what changed.`,
  );
}

/**
 * Approvers are any holder of approve or reject on `hrms.leaves`, never on
 * their own request unless they are the Owner (ADR CM-0012 §5). With two
 * levels, the second approver is someone other than the first (the Owner
 * may be both).
 */
export function assertMayDecide(
  state: LeaveRequestState,
  decider: LeaveDecider,
  stage: "request" | "cancellation",
): void {
  if (!decider.isOwner && decider.memberId === state.memberId)
    throw forbidden(
      "LEAVE_OWN_REQUEST",
      "You cannot decide your own leave request. Another approver must.",
    );
  if (
    stage === "request" &&
    !decider.isOwner &&
    decider.memberId != null &&
    state.levelDeciders.some(
      (item) =>
        item.level < state.currentLevel && item.memberId === decider.memberId,
    )
  )
    throw forbidden(
      "LEAVE_ALREADY_APPROVED_BY_YOU",
      "You approved the earlier level. The next level needs another approver.",
    );
}

/** Approve the waiting level: the next level, or approved with `released` + `used`. */
export function approveTransition(
  state: LeaveRequestState,
  decider: LeaveDecider,
): LeaveTransition {
  if (state.status !== "pending") throw notInState("pending");
  assertMayDecide(state, decider, "request");
  if (state.currentLevel < state.approvalLevels)
    return {
      status: "pending",
      currentLevel: state.currentLevel + 1,
      postings: [],
    };
  return {
    status: "approved",
    currentLevel: state.currentLevel,
    postings: [
      { kind: "released", days: state.totalDays },
      { kind: "used", days: -state.totalDays },
    ],
  };
}

/** A rejection reason or a cancellation reason: required, trimmed. */
export function requiredReason(
  raw: string | null | undefined,
  code: string,
  message: string,
): string {
  const reason = raw?.trim() ?? "";
  if (reason === "") throw invalid(code, message, "reason");
  if (reason.length > LEAVE_REQUEST_LIMITS.maxRemarksLength)
    throw invalid(
      "LEAVE_REMARKS_TOO_LONG",
      `Use at most ${String(LEAVE_REQUEST_LIMITS.maxRemarksLength)} characters.`,
      "reason",
    );
  return reason;
}

/** Optional approval remarks, trimmed; empty is null. */
export function optionalRemarks(raw: string | null | undefined): string | null {
  const remarks = raw?.trim() ?? "";
  if (remarks.length > LEAVE_REQUEST_LIMITS.maxRemarksLength)
    throw invalid(
      "LEAVE_REMARKS_TOO_LONG",
      `Use at most ${String(LEAVE_REQUEST_LIMITS.maxRemarksLength)} characters.`,
      "remarks",
    );
  return remarks === "" ? null : remarks;
}

/** Reject at any level: rejected, the reservation released. */
export function rejectTransition(
  state: LeaveRequestState,
  decider: LeaveDecider,
): LeaveTransition {
  if (state.status !== "pending") throw notInState("pending");
  assertMayDecide(state, decider, "request");
  return {
    status: "rejected",
    currentLevel: state.currentLevel,
    postings: [{ kind: "released", days: state.totalDays }],
  };
}

/** The member takes back a pending request (ADR CM-0012 §8). */
export function withdrawTransition(state: LeaveRequestState): LeaveTransition {
  if (state.status !== "pending") throw notInState("pending");
  return {
    status: "withdrawn",
    currentLevel: state.currentLevel,
    postings: [{ kind: "released", days: state.totalDays }],
  };
}

/**
 * Ask to cancel approved leave: it waits for an approver, or, for a type
 * that needs no approval, it is cancelled at once and the days restored.
 */
export function requestCancellationTransition(
  state: LeaveRequestState,
  needsApproval: boolean,
): LeaveTransition {
  if (state.status !== "approved") throw notInState("approved");
  if (!needsApproval)
    return {
      status: "cancelled",
      currentLevel: state.currentLevel,
      postings: [{ kind: "restored", days: state.totalDays }],
    };
  return {
    status: "cancellation_requested",
    currentLevel: state.currentLevel,
    postings: [],
  };
}

/** An approver approves (cancelled, days restored) or refuses (stays approved). */
export function decideCancellationTransition(
  state: LeaveRequestState,
  decider: LeaveDecider,
  approve: boolean,
): LeaveTransition {
  if (state.status !== "cancellation_requested")
    throw notInState("waiting for a cancellation decision");
  assertMayDecide(state, decider, "cancellation");
  return approve
    ? {
        status: "cancelled",
        currentLevel: state.currentLevel,
        postings: [{ kind: "restored", days: state.totalDays }],
      }
    : { status: "approved", currentLevel: state.currentLevel, postings: [] };
}
