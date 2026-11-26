import { QueryHttpError } from "@/src/queries/http";

/** What the attendance API's refusals mean, in the words a Teacher uses. */
const MESSAGES: Record<string, string> = {
  DATE_LOCKED:
    "Teachers can change only today and yesterday. Ask the Centre Head to correct this day.",
  DATE_IN_FUTURE: "You cannot mark a day that has not come yet.",
  TIME_IN_FUTURE: "That time has not come yet. Check the time and try again.",
  TIME_REQUIRED: "Enter the time for a past day.",
  TIME_INVALID: "Enter the time as hours and minutes.",
  CHILD_NOT_ON_ROSTER: "This Child is no longer in this Classroom.",
  COLLECTED_BY_NOTE_REQUIRED:
    "Write who is collecting the Child and who confirmed it.",
  COLLECTOR_NOT_ON_RECORD:
    "That Parent is not on the Child's record. Choose who is collecting them.",
  PICKUP_NOT_AUTHORISED: "Choose one of the Child's Authorised Pickups.",
  CHECK_OUT_BEFORE_CHECK_IN: "The check-out cannot be before the check-in.",
  NOT_PRESENT: "Mark the Child present first.",
  NOT_CHECKED_IN: "Check the Child in first.",
  NOT_CHECKED_OUT: "The Child has not been checked out.",
  CLASSROOM_FORBIDDEN: "You do not have access to this Classroom.",
};

export function attendanceErrorMessage(error: unknown): string {
  if (error instanceof QueryHttpError)
    return MESSAGES[error.code] ?? error.message;
  return "Could not save. Check your connection and try again.";
}
