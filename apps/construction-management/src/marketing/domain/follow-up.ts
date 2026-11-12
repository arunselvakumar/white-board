import type { OwnScope } from "@/src/shared-kernel/access";
import {
  isCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";

import { invalidField } from "./marketing-errors";
import {
  FOLLOW_UP_LIMITS,
  type FollowUpDue,
  type FollowUpStatus,
  type FollowUpType,
} from "./marketing-terms";

function lines(raw: string | null | undefined): string | null {
  const value =
    raw
      ?.split("\n")
      .map((line) => line.trimEnd())
      .join("\n")
      .trim() ?? "";
  return value === "" ? null : value;
}

function within(
  value: string | null,
  max: number,
  code: string,
  field: string,
): string | null {
  if (value != null && value.length > max)
    throw invalidField(code, `Keep it to ${String(max)} characters.`, field);
  return value;
}

export type FollowUpDetailsInput = {
  type: FollowUpType;
  /** `YYYY-MM-DD`, the Company's calendar. */
  dueDate: string;
  note?: string | null;
};

export type FollowUpDetails = {
  type: FollowUpType;
  dueDate: CalendarDate;
  note: string | null;
};

/** Checks a Follow-up's type, due date and note (PRD §3.5). */
export function followUpDetails(input: FollowUpDetailsInput): FollowUpDetails {
  if (!isCalendarDate(input.dueDate))
    throw invalidField(
      "FOLLOW_UP_DUE_DATE_INVALID",
      "Choose the date it is due.",
      "dueDate",
    );
  return {
    type: input.type,
    dueDate: input.dueDate,
    note: within(
      lines(input.note),
      FOLLOW_UP_LIMITS.note,
      "FOLLOW_UP_NOTE_TOO_LONG",
      "note",
    ),
  };
}

/**
 * Marking Done (PRD §3.5): a result note and the day it was done, today
 * unless given, never after today.
 */
export function followUpDone(
  input: { resultNote?: string | null; doneOn?: string | null },
  today: CalendarDate,
): { resultNote: string | null; doneOn: CalendarDate } {
  const doneOn = input.doneOn ?? today;
  if (!isCalendarDate(doneOn))
    throw invalidField(
      "FOLLOW_UP_DONE_ON_INVALID",
      "Choose the day it was done.",
      "doneOn",
    );
  if (doneOn > today)
    throw invalidField(
      "FOLLOW_UP_DONE_IN_FUTURE",
      "A Follow-up cannot be done on a day still to come.",
      "doneOn",
    );
  return {
    resultNote: within(
      lines(input.resultNote),
      FOLLOW_UP_LIMITS.resultNote,
      "FOLLOW_UP_RESULT_TOO_LONG",
      "resultNote",
    ),
    doneOn,
  };
}

/** Overdue, Today or Upcoming; null for a Follow-up that is not Open. */
export function followUpDue(
  followUp: { status: FollowUpStatus; dueDate: CalendarDate },
  today: CalendarDate,
): FollowUpDue | null {
  if (followUp.status !== "open") return null;
  if (followUp.dueDate < today) return "overdue";
  return followUp.dueDate === today ? "today" : "upcoming";
}

/**
 * Whether a member without View all sees a Follow-up (ADR CM-0040 §5):
 * they created it, or they own it.
 */
export function isFollowUpVisible(
  followUp: { createdBy: string; ownerMemberId: string },
  scope: OwnScope,
): boolean {
  if (scope == null) return true;
  if (followUp.createdBy === scope.userId) return true;
  return scope.memberId != null && followUp.ownerMemberId === scope.memberId;
}

/** Only an Open Follow-up moves (Done and Cancelled are final). */
export function assertOpen(status: FollowUpStatus, action: string): void {
  if (status !== "open")
    throw new DomainError(
      "FOLLOW_UP_NOT_OPEN",
      `Only an open Follow-up can be ${action}.`,
      { kind: "conflict" },
    );
}

/** What the daily reminders owe a Follow-up today (ADR CM-0040 §8). */
export function reminderDue(
  followUp: {
    status: FollowUpStatus;
    dueDate: CalendarDate;
    dueNotifiedOn: CalendarDate | null;
    overdueNotifiedAt: Date | null;
  },
  today: CalendarDate,
): "due" | "overdue" | null {
  if (followUp.status !== "open") return null;
  if (followUp.dueDate === today && followUp.dueNotifiedOn !== today)
    return "due";
  if (followUp.dueDate < today && followUp.overdueNotifiedAt == null)
    return "overdue";
  return null;
}
