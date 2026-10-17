import {
  isCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { DomainError, notFound } from "@/src/shared-kernel/domain-error";

import { salesDateTime } from "./inquiry";
import {
  FOLLOW_UP_ACTIVITIES,
  SALES_LIMITS,
  type FollowUpActivity,
} from "./sales-terms";
import {
  isSalesTime,
  salesInstant,
  toStoredFollowUpAt,
  type SalesDateTime,
  type StoredFollowUpAt,
} from "./sales-time";

/**
 * A follow-up (CM-1004, ADR CM-0022 §4): something that happened on an
 * Open inquiry — an Activity, when it was done, remarks, an optional stage
 * move and the next follow-up. Append-only: no edit; an Inquiry Delete
 * holder removes one entered by mistake.
 */

export const followUpNotFound = () =>
  notFound("FOLLOW_UP_NOT_FOUND", "This follow-up was not found.");

function refused(code: string, message: string, field: string): DomainError {
  return new DomainError(code, message, { details: { field } });
}

export type FollowUpInput = {
  activity: FollowUpActivity;
  /** The Company's wall clock: a date and `HH:MM`. */
  doneOn: { date: CalendarDate; time: string };
  remarks?: string | null;
  /** The stage it moves the inquiry to; null or left out keeps the stage. */
  toStageId?: string | null;
  /** The next follow-up; null clears it. */
  nextFollowUp?: SalesDateTime | null;
};

export type FollowUpFields = {
  activity: FollowUpActivity;
  doneAt: Date;
  doneOnDate: CalendarDate;
  remarks: string | null;
  next: StoredFollowUpAt | null;
};

/**
 * Checks a follow-up (CM-0022 §4): an Activity of the list; Done on a date
 * and time not after `now` (400 `FOLLOW_UP_IN_FUTURE`); the next follow-up
 * after Done on — with a time, a later instant; a date alone, the same day
 * or later (400 `NEXT_FOLLOW_UP_BEFORE_DONE`); remarks ≤ 2,000.
 */
export function followUpFields(
  input: FollowUpInput,
  now: Date,
  timeZone: string,
): FollowUpFields {
  if (!FOLLOW_UP_ACTIVITIES.includes(input.activity))
    throw refused(
      "FOLLOW_UP_ACTIVITY_INVALID",
      "Choose what was done.",
      "activity",
    );
  if (!isCalendarDate(input.doneOn.date) || !isSalesTime(input.doneOn.time))
    throw refused(
      "FOLLOW_UP_DONE_ON_INVALID",
      "Enter the date and time it was done.",
      "doneOn",
    );
  const doneAt = salesInstant(input.doneOn.date, input.doneOn.time, timeZone);
  // A minute's grace: the form fills in the current minute.
  if (doneAt.getTime() > now.getTime() + 60_000)
    throw refused(
      "FOLLOW_UP_IN_FUTURE",
      "Done on cannot be in the future.",
      "doneOn",
    );
  const remarks = input.remarks?.trim() ?? "";
  if (remarks.length > SALES_LIMITS.remarks)
    throw refused(
      "FOLLOW_UP_REMARKS_TOO_LONG",
      `Use at most ${String(SALES_LIMITS.remarks)} characters.`,
      "remarks",
    );
  const nextFollowUp = salesDateTime(
    input.nextFollowUp ?? null,
    "nextFollowUp",
  );
  const next = toStoredFollowUpAt(nextFollowUp, timeZone);
  if (nextFollowUp != null && next != null) {
    const before =
      nextFollowUp.time == null
        ? nextFollowUp.date < input.doneOn.date
        : next.at.getTime() <= doneAt.getTime();
    if (before)
      throw refused(
        "NEXT_FOLLOW_UP_BEFORE_DONE",
        "The next follow-up must be after Done on.",
        "nextFollowUp",
      );
  }
  return {
    activity: input.activity,
    doneAt,
    doneOnDate: input.doneOn.date,
    remarks: remarks === "" ? null : remarks,
    next,
  };
}

// ---------------------------------------------------------------------------
// Inquiry Tasks (CM-0022 §5)
// ---------------------------------------------------------------------------

export const inquiryTaskNotFound = () =>
  notFound("INQUIRY_TASK_NOT_FOUND", "This task was not found.");

export type InquiryTaskInput = {
  title: string;
  dueDate?: CalendarDate | null;
  assigneeMemberId?: string | null;
};

/** Title required, ≤ 200; a Due date that is a date. */
export function inquiryTaskFields(input: InquiryTaskInput): {
  title: string;
  dueDate: CalendarDate | null;
} {
  const title = input.title.trim().replace(/\s+/g, " ");
  if (title === "")
    throw refused("INQUIRY_TASK_TITLE_REQUIRED", "Enter the task.", "title");
  if (title.length > SALES_LIMITS.taskTitle)
    throw refused(
      "INQUIRY_TASK_TITLE_TOO_LONG",
      `Use at most ${String(SALES_LIMITS.taskTitle)} characters.`,
      "title",
    );
  const dueDate = input.dueDate ?? null;
  if (dueDate != null && !isCalendarDate(dueDate))
    throw refused("INQUIRY_TASK_DUE_INVALID", "Choose a date.", "dueDate");
  return { title, dueDate };
}
