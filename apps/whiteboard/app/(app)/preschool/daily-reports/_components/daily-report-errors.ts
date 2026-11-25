import { QueryHttpError } from "@/src/queries/http";

/** What the Daily Report API's refusals mean, in the words a Teacher uses. */
const MESSAGES: Record<string, string> = {
  DATE_LOCKED:
    "Teachers can change only today and yesterday. Ask the Centre Head to correct this day.",
  DATE_IN_FUTURE: "You cannot write a report for a day that has not come yet.",
  NAP_INCOMPLETE: "Enter when the nap started and ended.",
  NAP_ORDER: "The nap must end after it starts.",
  TIME_INVALID: "Enter times as hours and minutes.",
  MEAL_REPEATED: "Each meal can be recorded once.",
  TOO_MANY_TOILET_ENTRIES: "A report holds at most 12 toilet entries.",
  TOO_MANY_ACTIVITIES: "A report holds at most 10 activities.",
  ACTIVITY_TOO_LONG: "Keep each activity under 120 characters.",
  NOTE_TOO_LONG: "Keep the note under 2000 characters.",
  TOO_MANY_PHOTOS: "A report holds at most 6 photos.",
  PHOTO_URL_INVALID: "Photo links must start with https://.",
  CHILD_NOT_ON_ROSTER: "This Child is no longer in this Classroom.",
  CLASSROOM_FORBIDDEN: "You do not have access to this Classroom.",
};

export function dailyReportErrorMessage(error: unknown): string {
  if (error instanceof QueryHttpError)
    return MESSAGES[error.code] ?? error.message;
  return "Could not save. Check your connection and try again.";
}
