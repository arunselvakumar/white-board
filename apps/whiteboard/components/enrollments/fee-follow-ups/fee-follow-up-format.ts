import { dateKeyInZone } from "@/lib/calendar-dates";
import { QueryHttpError } from "@/src/queries/http";

/** Today in the Batch's timezone, as YYYY-MM-DD (ADR-0039: "today" is the Batch's day). */
export function todayInZone(timezone: string, now: Date = new Date()): string {
  return dateKeyInZone(now, timezone);
}

/** "Sat, 11 Oct 2026" for a YYYY-MM-DD calendar date. */
export function followUpDateLabel(key: string): string {
  const date = new Date(`${key}T00:00:00.000Z`);
  const weekday = new Intl.DateTimeFormat("en-IN", {
    timeZone: "UTC",
    weekday: "short",
  }).format(date);
  const day = new Intl.DateTimeFormat("en-IN", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
  return `${weekday}, ${day}`;
}

/** "9 Oct 2026, 3:45 pm" for a timestamp, in the Batch's timezone. */
export function loggedAtLabel(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: timezone,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

export type FeeFollowUpField = "channel" | "note" | "nextFollowUpOn";

const FIELD_BY_CODE: Record<string, FeeFollowUpField> = {
  FEE_FOLLOW_UP_CHANNEL_REQUIRED: "channel",
  FEE_FOLLOW_UP_NOTE_INVALID: "note",
  FEE_FOLLOW_UP_DATE_INVALID: "nextFollowUpOn",
  FEE_FOLLOW_UP_DATE_IN_PAST: "nextFollowUpOn",
};

const FIELD_MESSAGES: Record<FeeFollowUpField, string> = {
  channel: "Choose how you followed up",
  note: "Keep the note to 500 characters or fewer",
  nextFollowUpOn: "Choose today or a later date",
};

const ROOT_MESSAGES: Record<string, string> = {
  FEE_FOLLOW_UP_NO_DUES:
    "This Enrollment has no dues left, so the follow-up wasn’t saved.",
  FEE_FOLLOW_UP_CLOSED:
    "This Fee Follow-up was already closed, so it wasn’t changed.",
  FEE_FOLLOW_UP_CONFLICT:
    "Someone else just logged a follow-up for this Enrollment. Check the history and try again.",
};

export type FeeFollowUpFormError =
  | { kind: "field"; field: FeeFollowUpField; message: string }
  | { kind: "root"; message: string };

/** Turns an API error into a field error where a field is at fault, else one readable line. */
export function feeFollowUpFormErrors(error: unknown): FeeFollowUpFormError[] {
  const fallback = "Couldn’t save this follow-up. Please try again.";
  if (!(error instanceof QueryHttpError)) {
    return [{ kind: "root", message: fallback }];
  }
  const field = FIELD_BY_CODE[error.code];
  if (field != null) {
    return [{ kind: "field", field, message: FIELD_MESSAGES[field] }];
  }
  if (error.code === "VALIDATION_ERROR") {
    const fields = validationFields(error.details);
    if (fields.length > 0) {
      return fields.map((name) => ({
        kind: "field",
        field: name,
        message: FIELD_MESSAGES[name],
      }));
    }
    return [
      { kind: "root", message: "Check the follow-up details and try again." },
    ];
  }
  return [
    {
      kind: "root",
      message: ROOT_MESSAGES[error.code] ?? (error.message || fallback),
    },
  ];
}

export function feeFollowUpErrorMessage(error: unknown): string {
  const first = feeFollowUpFormErrors(error)[0];
  return first?.message ?? "Something went wrong. Please try again.";
}

export function isFeeFollowUpCode(error: unknown, code: string): boolean {
  return error instanceof QueryHttpError && error.code === code;
}

/** Field names in a `z.treeifyError` body that carry errors. */
function validationFields(details: unknown): FeeFollowUpField[] {
  if (typeof details !== "object" || details == null) return [];
  const properties = (details as { properties?: unknown }).properties;
  if (typeof properties !== "object" || properties == null) return [];
  return (Object.keys(FIELD_MESSAGES) as FeeFollowUpField[]).filter(
    (name) => name in properties,
  );
}
