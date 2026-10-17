import {
  isCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import {
  conflict,
  DomainError,
  notFound,
} from "@/src/shared-kernel/domain-error";

import {
  isSalesTime,
  type DueBounds,
  type SalesDateTime,
  type StoredFollowUpAt,
} from "./sales-time";
import {
  INTEREST_TYPES,
  normaliseMobile,
  SALES_LIMITS,
  type FollowUpDue,
  type InquiryStatus,
  type InterestType,
} from "./sales-terms";

/**
 * An Inquiry (CM-1003, ADR CM-0022 §3): a lead on one Project, Open at a
 * Funnel Stage until it is closed as Converted or Lost (CM-1007), with the
 * people responsible for it (Assignee, Lead Owner) and its next follow-up.
 * Its contact fields are personal data.
 */

export const inquiryNotFound = () =>
  notFound("INQUIRY_NOT_FOUND", "This Inquiry was not found.");

function refused(code: string, message: string, field: string): DomainError {
  return new DomainError(code, message, { details: { field } });
}

/** What the forms send (full and quick add are the same command). */
export type InquiryInput = {
  /** Default today; not in the future. */
  inquiryDate?: CalendarDate | null;
  name: string;
  mobile?: string | null;
  email?: string | null;
  address?: string | null;
  occupation?: string | null;
  interestType?: InterestType | null;
  interestedUnitType?: string | null;
  remarks?: string | null;
  nextFollowUp?: SalesDateTime | null;
};

/** The checked fields, ready to store (references are checked by the handlers). */
export type InquiryFields = {
  inquiryDate: CalendarDate;
  name: string;
  mobile: string | null;
  email: string | null;
  address: string | null;
  occupation: string | null;
  interestType: InterestType | null;
  interestedUnitType: string | null;
  remarks: string | null;
  nextFollowUp: SalesDateTime | null;
};

function text(
  raw: string | null | undefined,
  max: number,
  code: string,
  field: string,
  words: string,
): string | null {
  const value = raw?.trim() ?? "";
  if (value === "") return null;
  if (value.length > max)
    throw refused(
      code,
      `Use at most ${String(max)} characters for the ${words}.`,
      field,
    );
  return value;
}

/** A plain `name@domain.tld` check; the address is kept as typed. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Checks and normalises an inquiry's own fields (CM-0022 §3): Name required
 * (≤ 120); Mobile stored normalised (`+91…` for a ten-digit Indian number,
 * else `+` and 8–15 digits) or 400 `INQUIRY_MOBILE_INVALID`; Email a valid
 * address or 400 `INQUIRY_EMAIL_INVALID`; the Inquiry Date (today unless
 * given) not after `today` (400 `INQUIRY_DATE_IN_FUTURE`); the next
 * follow-up a date and an optional `HH:MM`.
 */
export function inquiryFields(
  input: InquiryInput,
  today: CalendarDate,
): InquiryFields {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name === "")
    throw refused("INQUIRY_NAME_REQUIRED", "Enter the name.", "name");
  if (name.length > SALES_LIMITS.name)
    throw refused(
      "INQUIRY_NAME_TOO_LONG",
      `Use at most ${String(SALES_LIMITS.name)} characters for the name.`,
      "name",
    );
  const inquiryDate = input.inquiryDate ?? today;
  if (!isCalendarDate(inquiryDate))
    throw refused(
      "INQUIRY_DATE_INVALID",
      "Choose the Inquiry Date.",
      "inquiryDate",
    );
  if (inquiryDate > today)
    throw refused(
      "INQUIRY_DATE_IN_FUTURE",
      "The Inquiry Date cannot be in the future.",
      "inquiryDate",
    );
  const rawMobile = input.mobile?.trim() ?? "";
  let mobile: string | null = null;
  if (rawMobile !== "") {
    mobile = normaliseMobile(rawMobile);
    if (mobile == null)
      throw refused(
        "INQUIRY_MOBILE_INVALID",
        "Enter a 10-digit mobile number, or one with its country code (+ and 8–15 digits).",
        "mobile",
      );
  }
  const email = input.email?.trim() ?? "";
  if (email !== "" && (email.length > 254 || !EMAIL_RE.test(email)))
    throw refused(
      "INQUIRY_EMAIL_INVALID",
      "Enter a valid email address.",
      "email",
    );
  const interestType = input.interestType ?? null;
  if (interestType != null && !INTEREST_TYPES.includes(interestType))
    throw refused(
      "INQUIRY_INTEREST_TYPE_INVALID",
      "Choose Hot, Warm or Cold.",
      "interestType",
    );
  return {
    inquiryDate,
    name,
    mobile,
    email: email === "" ? null : email,
    address: text(
      input.address,
      SALES_LIMITS.address,
      "INQUIRY_ADDRESS_TOO_LONG",
      "address",
      "address",
    ),
    occupation: text(
      input.occupation,
      SALES_LIMITS.occupation,
      "INQUIRY_OCCUPATION_TOO_LONG",
      "occupation",
      "occupation",
    ),
    interestType,
    interestedUnitType: text(
      input.interestedUnitType,
      SALES_LIMITS.unitType,
      "INQUIRY_UNIT_TYPE_TOO_LONG",
      "interestedUnitType",
      "unit type",
    ),
    remarks: text(
      input.remarks,
      SALES_LIMITS.remarks,
      "INQUIRY_REMARKS_TOO_LONG",
      "remarks",
      "remarks",
    ),
    nextFollowUp: salesDateTime(input.nextFollowUp ?? null, "nextFollowUp"),
  };
}

/** A date and optional time: 400 `<FIELD>_INVALID` when either is not one. */
export function salesDateTime(
  value: SalesDateTime | null,
  field: string,
): SalesDateTime | null {
  if (value == null) return null;
  if (!isCalendarDate(value.date))
    throw refused("DATE_INVALID", "Choose a date.", field);
  const time = value.time?.trim() ?? "";
  if (time !== "" && !isSalesTime(time))
    throw refused("TIME_INVALID", "Enter the time as HH:MM.", field);
  return { date: value.date, time: time === "" ? null : time };
}

// ---------------------------------------------------------------------------
// Status (CM-0022 §3, §6). Pure, so CM-1007 can close and reopen.
// ---------------------------------------------------------------------------

export type InquiryTransition = "convert" | "lose" | "reopen";

const TRANSITIONS: Record<
  InquiryTransition,
  { from: readonly InquiryStatus[]; to: InquiryStatus }
> = {
  convert: { from: ["open"], to: "converted" },
  lose: { from: ["open"], to: "lost" },
  reopen: { from: ["converted", "lost"], to: "open" },
};

export function canTransitionInquiry(
  status: InquiryStatus,
  transition: InquiryTransition,
): boolean {
  return TRANSITIONS[transition].from.includes(status);
}

/**
 * The status after a transition, or 409 `INQUIRY_NOT_OPEN` (close a closed
 * one) / `INQUIRY_NOT_CLOSED` (reopen an open one).
 */
export function inquiryTransition(
  status: InquiryStatus,
  transition: InquiryTransition,
): InquiryStatus {
  if (canTransitionInquiry(status, transition))
    return TRANSITIONS[transition].to;
  if (transition === "reopen")
    throw conflict("INQUIRY_NOT_CLOSED", "This Inquiry is already open.", {
      status,
    });
  throw inquiryNotOpen(status);
}

/** 409 `INQUIRY_NOT_OPEN`: follow-ups, stage moves and closing need an Open inquiry. */
export function inquiryNotOpen(status: InquiryStatus): DomainError {
  return conflict(
    "INQUIRY_NOT_OPEN",
    `This Inquiry is ${status === "converted" ? "Converted" : "Lost"}. Reopen it first.`,
    { status },
  );
}

export function assertInquiryOpen(status: InquiryStatus): void {
  if (status !== "open") throw inquiryNotOpen(status);
}

// ---------------------------------------------------------------------------
// Due (CM-0022 §4): derived from the next follow-up, for Open inquiries.
// ---------------------------------------------------------------------------

/**
 * Overdue: before now (a date without a time: before today). Today: later
 * today. Upcoming: from tomorrow. None: no next follow-up. Closed
 * inquiries are none of them (null).
 */
export function followUpDue(
  status: InquiryStatus,
  next: StoredFollowUpAt | null,
  bounds: DueBounds,
): FollowUpDue | null {
  if (status !== "open") return null;
  if (next == null) return "none";
  const at = next.at.getTime();
  const overdueBefore = next.hasTime
    ? bounds.now.getTime()
    : bounds.todayStart.getTime();
  if (at < overdueBefore) return "overdue";
  if (at < bounds.tomorrowStart.getTime()) return "today";
  return "upcoming";
}

/** 409 `INQUIRY_DUPLICATE` with the matching live inquiries (CM-0022 §3). */
export function inquiryDuplicate(
  matches: readonly {
    id: string;
    name: string | null;
    status: InquiryStatus;
  }[],
): DomainError {
  return conflict(
    "INQUIRY_DUPLICATE",
    matches.length === 1
      ? "Another inquiry of this Project has the same mobile or email."
      : `${String(matches.length)} inquiries of this Project have the same mobile or email.`,
    { matches },
  );
}

/** 409 `INQUIRY_HAS_BOOKING`: a Converted inquiry whose booking is active. */
export function inquiryHasBooking(bookingId: string): DomainError {
  return conflict(
    "INQUIRY_HAS_BOOKING",
    "This Inquiry was converted and its booking is still active. Cancel or delete the booking first.",
    { bookingId },
  );
}

/** 409 `INQUIRY_CHANGED` for a stale `expectedUpdatedAt`. */
export function inquiryChanged(updatedAt: Date): DomainError {
  return conflict(
    "INQUIRY_CHANGED",
    "Someone changed this Inquiry. Reload it and try again.",
    { updatedAt: updatedAt.toISOString() },
  );
}

// ---------------------------------------------------------------------------
// Closing and reopening (CM-1007, ADR CM-0022 §6)
// ---------------------------------------------------------------------------

/** 409 `INQUIRY_BOOKING_ACTIVE`: a Converted inquiry reopens only once its booking is gone. */
export function inquiryBookingActive(bookingId: string): DomainError {
  return conflict(
    "INQUIRY_BOOKING_ACTIVE",
    "This Inquiry's booking is still On Hold or Booked. Cancel or delete the booking first, then reopen it.",
    { bookingId },
  );
}

/** A Lost inquiry's remarks: optional, ≤ 2,000. */
export function lostRemarks(raw: string | null | undefined): string | null {
  const value = raw?.trim() ?? "";
  if (value.length > SALES_LIMITS.remarks)
    throw refused(
      "INQUIRY_LOST_REMARKS_TOO_LONG",
      `Use at most ${String(SALES_LIMITS.remarks)} characters.`,
      "remarks",
    );
  return value === "" ? null : value;
}

/** What closing writes; reopening clears it all. */
export type InquiryClosing = {
  status: InquiryStatus;
  convertedUnitId: string | null;
  convertedBookingId: string | null;
  lostReasonId: string | null;
  lostRemarks: string | null;
  closedAt: Date | null;
  closedBy: string | null;
};

export const OPEN_CLOSING: InquiryClosing = {
  status: "open",
  convertedUnitId: null,
  convertedBookingId: null,
  lostReasonId: null,
  lostRemarks: null,
  closedAt: null,
  closedBy: null,
};
