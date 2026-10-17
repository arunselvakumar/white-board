import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { conflict, DomainError } from "@/src/shared-kernel/domain-error";

import {
  AREA_UNIT_LABELS,
  AREA_UNITS,
  SALES_LIMITS,
  UNAVAILABLE_REASONS,
  type AreaUnit,
  type UnavailableReason,
  type UnitSalesStatus,
} from "./sales-terms";

/**
 * A unit's sales profile (CM-1005, ADR CM-0022 §8): Unit type, Carpet /
 * Built-up / Super built-up area with their area unit, and whether it is
 * Unavailable (not for sale) with a reason and a note. A unit without a
 * profile row has no details and is for sale.
 */

/** The longest Unavailable note. */
export const UNIT_NOTE_MAX = 500;

/** The largest area the column holds (`numeric(12, 2)`). */
const AREA_MAX = 9_999_999_999.99;

export type UnitProfileInput = {
  unitType?: string | null;
  carpetArea?: string | number | null;
  builtUpArea?: string | number | null;
  superBuiltUpArea?: string | number | null;
  areaUnit?: string | null;
};

/** The checked sales details; areas as decimal strings (`"1250.5"`). */
export type UnitProfileFields = {
  unitType: string | null;
  carpetArea: string | null;
  builtUpArea: string | null;
  superBuiltUpArea: string | null;
  areaUnit: AreaUnit;
};

export const AREA_FIELDS = [
  "carpetArea",
  "builtUpArea",
  "superBuiltUpArea",
] as const;
export type AreaField = (typeof AREA_FIELDS)[number];

export const AREA_FIELD_LABELS: Record<AreaField, string> = {
  carpetArea: "Carpet area",
  builtUpArea: "Built-up area",
  superBuiltUpArea: "Super built-up area",
};

function refused(code: string, message: string, field: string): DomainError {
  return new DomainError(code, message, { details: { field } });
}

export function isAreaUnit(value: string): value is AreaUnit {
  return (AREA_UNITS as readonly string[]).includes(value);
}

export function isUnavailableReason(value: string): value is UnavailableReason {
  return (UNAVAILABLE_REASONS as readonly string[]).includes(value);
}

/**
 * An area as typed or as an Excel number: more than 0, at most two
 * decimals. Commas are ignored ("1,250.50"). Null when blank; throws 400
 * `AREA_INVALID` (with the field) otherwise.
 */
export function parseArea(
  raw: string | number | null | undefined,
  field: string,
): string | null {
  if (raw == null) return null;
  const text =
    typeof raw === "number"
      ? Number.isFinite(raw)
        ? String(Math.round(raw * 100) / 100)
        : "x"
      : raw.trim().replace(/,/g, "");
  if (text === "") return null;
  if (
    typeof raw === "number" &&
    Math.abs(raw * 100 - Math.round(raw * 100)) > 1e-6
  )
    throw refused(
      "AREA_INVALID",
      "Enter an area with at most two decimals.",
      field,
    );
  const match = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(text);
  if (match == null)
    throw refused(
      "AREA_INVALID",
      "Enter an area as a number with at most two decimals.",
      field,
    );
  const value = Number(text);
  if (!(value > 0) || value > AREA_MAX)
    throw refused("AREA_INVALID", "An area must be more than 0.", field);
  const whole = String(Number(match[1]));
  const decimals = (match[2] ?? "").replace(/0+$/, "");
  return decimals === "" ? whole : `${whole}.${decimals}`;
}

/** Checks and normalises the sales details (CM-0022 §8). */
export function unitProfileFields(input: UnitProfileInput): UnitProfileFields {
  const unitType = input.unitType?.trim().replace(/\s+/g, " ") ?? "";
  if (unitType.length > SALES_LIMITS.unitType)
    throw refused(
      "UNIT_TYPE_TOO_LONG",
      `Keep the Unit type to ${String(SALES_LIMITS.unitType)} characters.`,
      "unitType",
    );
  const areaUnit = input.areaUnit?.trim() ?? "";
  if (areaUnit !== "" && !isAreaUnit(areaUnit))
    throw refused("AREA_UNIT_INVALID", "Choose sq ft or sq m.", "areaUnit");
  return {
    unitType: unitType === "" ? null : unitType,
    carpetArea: parseArea(input.carpetArea, "carpetArea"),
    builtUpArea: parseArea(input.builtUpArea, "builtUpArea"),
    superBuiltUpArea: parseArea(input.superBuiltUpArea, "superBuiltUpArea"),
    areaUnit: areaUnit === "" ? "sq_ft" : areaUnit,
  };
}

export type UnavailableFields = {
  reason: UnavailableReason;
  note: string | null;
};

/** Unavailable needs a reason; the note is optional (≤ 500). */
export function unavailableFields(input: {
  reason: string;
  note?: string | null;
}): UnavailableFields {
  if (!isUnavailableReason(input.reason))
    throw refused(
      "UNAVAILABLE_REASON_INVALID",
      "Choose why the unit is not for sale.",
      "reason",
    );
  const note = input.note?.trim() ?? "";
  if (note.length > UNIT_NOTE_MAX)
    throw refused(
      "UNAVAILABLE_NOTE_TOO_LONG",
      `Keep the note to ${String(UNIT_NOTE_MAX)} characters.`,
      "note",
    );
  return { reason: input.reason, note: note === "" ? null : note };
}

/** What a sales status reads from a unit's active booking. */
export type ActiveBookingFacts = {
  status: "on_hold" | "booked";
  holdUntil: CalendarDate | null;
};

/** An On Hold booking whose Hold until is before `today` (CM-0022 §7). */
export function isHoldExpired(
  booking: { status: string; holdUntil: CalendarDate | null },
  today: CalendarDate,
): boolean {
  return (
    booking.status === "on_hold" &&
    booking.holdUntil != null &&
    booking.holdUntil < today
  );
}

/**
 * A unit's sales status on `today` (CM-0022 §7, §8): Unavailable when its
 * profile says so, else its active booking's status, else Available. A
 * hold past its Hold until date counts as Available.
 */
export function unitSalesStatus(
  profile: { unavailable: boolean } | null,
  booking: ActiveBookingFacts | null,
  today: CalendarDate,
): UnitSalesStatus {
  if (profile?.unavailable === true) return "unavailable";
  if (booking == null || isHoldExpired(booking, today)) return "available";
  return booking.status;
}

/** "1,050.5 sq ft" (Indian grouping), or null without an area. */
export function areaWithUnit(
  area: string | null,
  unit: AreaUnit,
): string | null {
  if (area == null) return null;
  const [whole = "0", decimals] = area.split(".");
  const grouped = Number(whole).toLocaleString("en-IN");
  return `${decimals == null ? grouped : `${grouped}.${decimals}`} ${AREA_UNIT_LABELS[unit]}`;
}

export const unitProfileChanged = (updatedAt: Date | null) =>
  conflict(
    "UNIT_PROFILE_CHANGED",
    "Someone changed this unit's details. Reload it and try again.",
    { updatedAt: updatedAt?.toISOString() ?? null },
  );

export const unitHasBooking = (bookingId: string) =>
  conflict(
    "UNIT_HAS_BOOKING",
    "This unit is on hold or booked. Cancel the booking before marking it unavailable.",
    { bookingId },
  );

export const unitNotFound = () =>
  new DomainError("UNIT_NOT_FOUND", "This unit was not found on the Project.", {
    kind: "not_found",
    details: { field: "unitId" },
  });
