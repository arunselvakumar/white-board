import {
  isCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { conflict, DomainError } from "@/src/shared-kernel/domain-error";

import {
  normaliseMobile,
  SALES_LIMITS,
  type BookingStatus,
} from "./sales-terms";
import { isHoldExpired } from "./unit-profile";

/**
 * Bookings on units (CM-1006, ADR CM-0022 §7): **On Hold** or **Booked**
 * while active — at most one per unit — and **Cancelled** after. A hold
 * may carry a Hold until date; after it the booking shows **Hold expired**
 * and its unit counts as Available. Every status a booking takes is kept
 * in its history.
 */

/** What lists and pages show: a stored status, or Hold expired. */
export const BOOKING_DISPLAY_STATUSES = [
  "on_hold",
  "hold_expired",
  "booked",
  "cancelled",
] as const;
export type BookingDisplayStatus = (typeof BOOKING_DISPLAY_STATUSES)[number];

export const BOOKING_DISPLAY_STATUS_LABELS: Record<
  BookingDisplayStatus,
  string
> = {
  on_hold: "On Hold",
  hold_expired: "Hold expired",
  booked: "Booked",
  cancelled: "Cancelled",
};

/** The statuses a new booking may start in. */
export const BOOKING_START_STATUSES = ["on_hold", "booked"] as const;
export type BookingStartStatus = (typeof BOOKING_START_STATUSES)[number];

export function bookingDisplayStatus(
  booking: { status: BookingStatus; holdUntil: CalendarDate | null },
  today: CalendarDate,
): BookingDisplayStatus {
  return isHoldExpired(booking, today) ? "hold_expired" : booking.status;
}

export function isActiveBooking(status: BookingStatus): boolean {
  return status === "on_hold" || status === "booked";
}

export type BookingInput = {
  bookingDate: string;
  holdUntil?: string | null;
  customerName: string;
  customerMobile?: string | null;
  customerEmail?: string | null;
  customerAddress?: string | null;
  referredByName?: string | null;
  referredByContact?: string | null;
  remarks?: string | null;
};

/** The checked own fields of a booking (the unit is the handler's). */
export type BookingFields = {
  bookingDate: CalendarDate;
  holdUntil: CalendarDate | null;
  customerName: string;
  customerMobile: string | null;
  customerEmail: string | null;
  customerAddress: string | null;
  referredByName: string | null;
  referredByContact: string | null;
  remarks: string | null;
};

function refused(code: string, message: string, field: string): DomainError {
  return new DomainError(code, message, { details: { field } });
}

function optionalText(
  raw: string | null | undefined,
  max: number,
  field: string,
  what: string,
): string | null {
  const value = raw?.trim() ?? "";
  if (value.length > max)
    throw refused(
      `${field.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}_TOO_LONG`,
      `Keep the ${what} to ${String(max)} characters.`,
      field,
    );
  return value === "" ? null : value;
}

/** A mobile as typed → `+91…` (CM-0022 §3), or null when blank. */
export function bookingMobile(
  raw: string | null | undefined,
  field: string,
): string | null {
  const value = raw?.trim() ?? "";
  if (value === "") return null;
  const mobile = normaliseMobile(value);
  if (mobile == null)
    throw refused(
      "MOBILE_INVALID",
      "Enter a 10-digit mobile number, or + and the country code.",
      field,
    );
  return mobile;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function bookingEmail(raw: string | null | undefined): string | null {
  const value = raw?.trim() ?? "";
  if (value === "") return null;
  if (value.length > 254 || !EMAIL.test(value))
    throw refused(
      "EMAIL_INVALID",
      "Enter a valid email address.",
      "customerEmail",
    );
  return value;
}

/** A required business date, not after today. */
export function bookingDay(
  raw: string,
  today: CalendarDate,
  field: string,
  what: string,
): CalendarDate {
  const value = raw.trim();
  if (value === "")
    throw refused("BOOKING_DATE_REQUIRED", `Choose the ${what}.`, field);
  if (!isCalendarDate(value))
    throw refused("BOOKING_DATE_INVALID", "Enter a date as YYYY-MM-DD.", field);
  if (value > today)
    throw refused(
      "BOOKING_DATE_IN_FUTURE",
      `The ${what} cannot be after today.`,
      field,
    );
  return value;
}

/**
 * Checks and normalises a booking's fields (CM-0022 §7): Booking Date
 * required and not after today; Hold until only On Hold, not before the
 * Booking Date; Customer name required. The back-dated window is the
 * handler's (it needs the policy and the actor).
 */
export function bookingFields(
  input: BookingInput,
  status: BookingStatus,
  today: CalendarDate,
): BookingFields {
  const bookingDate = bookingDay(
    input.bookingDate,
    today,
    "bookingDate",
    "Booking Date",
  );
  let holdUntil: CalendarDate | null = null;
  const rawHold = input.holdUntil?.trim() ?? "";
  if (status === "on_hold" && rawHold !== "") {
    if (!isCalendarDate(rawHold))
      throw refused(
        "BOOKING_DATE_INVALID",
        "Enter a date as YYYY-MM-DD.",
        "holdUntil",
      );
    if (rawHold < bookingDate)
      throw refused(
        "HOLD_UNTIL_BEFORE_BOOKING_DATE",
        "Hold until cannot be before the Booking Date.",
        "holdUntil",
      );
    holdUntil = rawHold;
  }
  const customerName = input.customerName.trim().replace(/\s+/g, " ");
  if (customerName === "")
    throw refused(
      "CUSTOMER_NAME_REQUIRED",
      "Enter the customer's name.",
      "customerName",
    );
  if (customerName.length > SALES_LIMITS.name)
    throw refused(
      "CUSTOMER_NAME_TOO_LONG",
      `Keep the name to ${String(SALES_LIMITS.name)} characters.`,
      "customerName",
    );
  return {
    bookingDate,
    holdUntil,
    customerName,
    customerMobile: bookingMobile(input.customerMobile, "customerMobile"),
    customerEmail: bookingEmail(input.customerEmail),
    customerAddress: optionalText(
      input.customerAddress,
      SALES_LIMITS.address,
      "customerAddress",
      "address",
    ),
    referredByName: optionalText(
      input.referredByName,
      SALES_LIMITS.referredBy,
      "referredByName",
      "Referred By name",
    ),
    referredByContact: bookingMobile(
      input.referredByContact,
      "referredByContact",
    ),
    remarks: optionalText(
      input.remarks,
      SALES_LIMITS.remarks,
      "remarks",
      "remarks",
    ),
  };
}

/** Confirm: On Hold → Booked on a date not before the Booking Date, not after today. */
export function confirmDate(
  raw: string,
  booking: { bookingDate: CalendarDate },
  today: CalendarDate,
): CalendarDate {
  const date = bookingDay(raw, today, "confirmedOn", "confirm date");
  if (date < booking.bookingDate)
    throw refused(
      "CONFIRM_DATE_BEFORE_BOOKING_DATE",
      "The confirm date cannot be before the Booking Date.",
      "confirmedOn",
    );
  return date;
}

/** Extend hold: a new Hold until, today or later and not before the Booking Date. */
export function extendedHoldUntil(
  raw: string,
  booking: { bookingDate: CalendarDate },
  today: CalendarDate,
): CalendarDate {
  const value = raw.trim();
  if (!isCalendarDate(value))
    throw refused(
      "BOOKING_DATE_INVALID",
      "Enter a date as YYYY-MM-DD.",
      "holdUntil",
    );
  if (value < today || value < booking.bookingDate)
    throw refused(
      "HOLD_UNTIL_IN_PAST",
      "Hold until must be today or later.",
      "holdUntil",
    );
  return value;
}

export type CancelFields = { cancelledOn: CalendarDate; reason: string };

/** Cancel: a reason (≤ 500) and a date not before the Booking Date, not after today. */
export function cancelFields(
  input: { reason: string; cancelledOn: string },
  booking: { bookingDate: CalendarDate },
  today: CalendarDate,
): CancelFields {
  const reason = input.reason.trim();
  if (reason === "")
    throw refused(
      "CANCEL_REASON_REQUIRED",
      "Say why the booking is cancelled.",
      "reason",
    );
  if (reason.length > SALES_LIMITS.cancelReason)
    throw refused(
      "CANCEL_REASON_TOO_LONG",
      `Keep the reason to ${String(SALES_LIMITS.cancelReason)} characters.`,
      "reason",
    );
  const cancelledOn = bookingDay(
    input.cancelledOn,
    today,
    "cancelledOn",
    "cancel date",
  );
  if (cancelledOn < booking.bookingDate)
    throw refused(
      "CANCEL_DATE_BEFORE_BOOKING_DATE",
      "The cancel date cannot be before the Booking Date.",
      "cancelledOn",
    );
  return { cancelledOn, reason };
}

export type BookingAction = "confirm" | "extend_hold" | "cancel" | "edit";

/** Whether a booking in `status` takes `action`. */
export function canTakeAction(
  status: BookingStatus,
  action: BookingAction,
): boolean {
  switch (action) {
    case "confirm":
    case "extend_hold":
      return status === "on_hold";
    case "cancel":
    case "edit":
      return isActiveBooking(status);
  }
}

/** 409 `BOOKING_NOT_ON_HOLD` / `BOOKING_CANCELLED` for an action its status refuses. */
export function assertAction(
  status: BookingStatus,
  action: BookingAction,
): void {
  if (canTakeAction(status, action)) return;
  if (status === "cancelled")
    throw conflict(
      "BOOKING_CANCELLED",
      "This booking is cancelled. Book the unit again instead.",
    );
  throw conflict("BOOKING_NOT_ON_HOLD", "Only a booking On Hold can do this.");
}

/** The kind of a history row, read from it and the row before. */
export type BookingHistoryKind =
  "created" | "confirmed" | "hold_extended" | "cancelled";

export function bookingHistoryKinds(
  rows: readonly { status: BookingStatus }[],
): BookingHistoryKind[] {
  return rows.map((row, index) => {
    if (index === 0) return "created";
    if (row.status === "cancelled") return "cancelled";
    if (row.status === "booked") return "confirmed";
    return "hold_extended";
  });
}

export const bookingNotFound = () =>
  new DomainError("BOOKING_NOT_FOUND", "This booking was not found.", {
    kind: "not_found",
  });

export const bookingChanged = (updatedAt: Date) =>
  conflict(
    "BOOKING_CHANGED",
    "Someone changed this booking. Reload it and try again.",
    { updatedAt: updatedAt.toISOString() },
  );

export const unitBooked = (bookingId: string | null) =>
  conflict(
    "UNIT_BOOKED",
    "This unit is already on hold or booked. Choose another unit.",
    { bookingId },
  );

export const unitUnavailable = () =>
  conflict(
    "UNIT_UNAVAILABLE",
    "This unit is marked unavailable. Make it available before booking it.",
  );
