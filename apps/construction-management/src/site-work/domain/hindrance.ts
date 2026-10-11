import {
  assertCalendarDate,
  daysBetween,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  optionalDecimal,
  optionalLine,
  pastOrToday,
  requiredLine,
} from "./site-record-text";

/**
 * The Hindrance register (ADR CM-0016 §14, CM-607): each stoppage on site,
 * its cause, the activity it held up, how long and who was responsible,
 * with a joint sign-off recorded (not an approval). It is the evidence
 * for extension-of-time and escalation claims.
 */

export const HINDRANCE_CAUSES = [
  "weather",
  "material_shortage",
  "labour_shortage",
  "drawing_delay",
  "client_decision",
  "payment_delay",
  "equipment_breakdown",
  "power_water",
  "statutory_permit",
  "other",
] as const;
export type HindranceCause = (typeof HINDRANCE_CAUSES)[number];

export const HINDRANCE_CAUSE_LABELS: Record<HindranceCause, string> = {
  weather: "Weather",
  material_shortage: "Material shortage",
  labour_shortage: "Labour shortage",
  drawing_delay: "Drawing / design delay",
  client_decision: "Client decision",
  payment_delay: "Payment delay",
  equipment_breakdown: "Equipment breakdown",
  power_water: "Power / water",
  statutory_permit: "Statutory / permit",
  other: "Other",
};

export const RESPONSIBLE_PARTIES = [
  "company",
  "contractor",
  "client",
  "consultant",
  "supplier",
  "force_majeure",
] as const;
export type ResponsibleParty = (typeof RESPONSIBLE_PARTIES)[number];

export const RESPONSIBLE_PARTY_LABELS: Record<ResponsibleParty, string> = {
  company: "Company",
  contractor: "Contractor",
  client: "Client",
  consultant: "Consultant",
  supplier: "Supplier",
  force_majeure: "Force majeure",
};

export const HINDRANCE_STATUSES = ["open", "closed"] as const;
export type HindranceStatus = (typeof HINDRANCE_STATUSES)[number];

export const HINDRANCE_STATUS_LABELS: Record<HindranceStatus, string> = {
  open: "Open",
  closed: "Closed",
};

export function isHindranceCause(value: string): value is HindranceCause {
  return (HINDRANCE_CAUSES as readonly string[]).includes(value);
}

export function isResponsibleParty(value: string): value is ResponsibleParty {
  return (RESPONSIBLE_PARTIES as readonly string[]).includes(value);
}

export const HINDRANCE_LIMITS = {
  affectedActivity: 200,
  description: 2000,
  partyName: 120,
  partyRole: 120,
  /** Hours lost: up to 999999.99 (`decimal(8,2)`). */
  hoursDigits: 6,
} as const;

export type HindranceSignOffInput = {
  /** A Team Member assigned to the Project, or the Owner (a User id). */
  userId?: string | null;
  partyName?: string | null;
  partyRole?: string | null;
  signedOn?: string | null;
};

export type HindranceInput = {
  startDate: string;
  endDate?: string | null;
  hoursLost?: string | number | null;
  cause: string;
  affectedActivity: string;
  responsibleParty: string;
  contractorId?: string | null;
  description?: string | null;
  signOff?: HindranceSignOffInput | null;
};

export type HindranceSignOff = {
  userId: string | null;
  partyName: string;
  partyRole: string | null;
  signedOn: CalendarDate;
};

/** The checked fields of a hindrance (location, usage sheet and party ids are checked by the handler). */
export type HindranceFields = {
  startDate: CalendarDate;
  endDate: CalendarDate | null;
  /** Decimal string, at most two decimals, or null. */
  hoursLost: string | null;
  cause: HindranceCause;
  affectedActivity: string;
  responsibleParty: ResponsibleParty;
  /** Set exactly when the party is a Contractor. */
  contractorId: string | null;
  description: string | null;
  signOff: HindranceSignOff | null;
};

const DATE_CODES = {
  invalid: "HINDRANCE_DATE_INVALID",
  future: "HINDRANCE_DATE_IN_FUTURE",
};

/** Hours lost: ≥ 0, two decimals at most. */
export function hoursLost(
  raw: string | number | null | undefined,
): string | null {
  return optionalDecimal(raw, {
    code: "HINDRANCE_HOURS_INVALID",
    field: "hoursLost",
    scale: 2,
    digits: HINDRANCE_LIMITS.hoursDigits,
  });
}

/** The end date: on or after the start, not after today. */
export function endDate(
  raw: string | null | undefined,
  start: CalendarDate,
  today: CalendarDate,
): CalendarDate | null {
  if (raw == null || raw.trim() === "") return null;
  const end = pastOrToday(raw.trim(), DATE_CODES, "endDate", today);
  if (end < start)
    throw new DomainError(
      "HINDRANCE_END_BEFORE_START",
      "The end date cannot be before the start date.",
      { details: { field: "endDate" } },
    );
  return end;
}

/**
 * The joint sign-off: the other party's name and the date go together
 * (all or none); the Team Member and the party's role are optional but
 * need them. The date is on or after the start and not after today.
 */
export function hindranceSignOff(
  input: HindranceSignOffInput | null | undefined,
  start: CalendarDate,
  today: CalendarDate,
): HindranceSignOff | null {
  if (input == null) return null;
  const userId = input.userId?.trim() ?? "";
  const partyName = optionalLine(
    input.partyName,
    "signOff.partyName",
    HINDRANCE_LIMITS.partyName,
  );
  const partyRole = optionalLine(
    input.partyRole,
    "signOff.partyRole",
    HINDRANCE_LIMITS.partyRole,
  );
  const signedOnRaw = input.signedOn?.trim() ?? "";
  if (
    partyName == null &&
    signedOnRaw === "" &&
    userId === "" &&
    partyRole == null
  )
    return null;
  if (partyName == null)
    throw new DomainError(
      "HINDRANCE_SIGN_OFF_INCOMPLETE",
      "Enter the other party's name, or clear the sign-off.",
      { details: { field: "signOff.partyName" } },
    );
  if (signedOnRaw === "")
    throw new DomainError(
      "HINDRANCE_SIGN_OFF_INCOMPLETE",
      "Choose the date it was signed, or clear the sign-off.",
      { details: { field: "signOff.signedOn" } },
    );
  const signedOn = pastOrToday(
    signedOnRaw,
    DATE_CODES,
    "signOff.signedOn",
    today,
  );
  if (signedOn < start)
    throw new DomainError(
      "HINDRANCE_SIGNED_BEFORE_START",
      "The sign-off cannot be before the start date.",
      { details: { field: "signOff.signedOn" } },
    );
  return {
    userId: userId === "" ? null : userId,
    partyName,
    partyRole,
    signedOn,
  };
}

/** Checks and normalises a hindrance's own fields against `today`. */
export function hindranceFields(
  input: HindranceInput,
  today: CalendarDate,
): HindranceFields {
  const startDate = pastOrToday(
    input.startDate,
    DATE_CODES,
    "startDate",
    today,
  );
  if (!isHindranceCause(input.cause))
    throw new DomainError("HINDRANCE_CAUSE_INVALID", "Choose the cause.", {
      details: { field: "cause" },
    });
  if (!isResponsibleParty(input.responsibleParty))
    throw new DomainError(
      "HINDRANCE_PARTY_INVALID",
      "Choose the responsible party.",
      { details: { field: "responsibleParty" } },
    );
  const contractorId = input.contractorId?.trim() ?? "";
  if (input.responsibleParty === "contractor" && contractorId === "")
    throw new DomainError(
      "HINDRANCE_CONTRACTOR_REQUIRED",
      "Choose the Contractor responsible.",
      { details: { field: "contractorId" } },
    );
  return {
    startDate,
    endDate: endDate(input.endDate, startDate, today),
    hoursLost: hoursLost(input.hoursLost),
    cause: input.cause,
    affectedActivity: requiredLine(
      input.affectedActivity,
      "HINDRANCE_ACTIVITY_REQUIRED",
      "Enter the affected activity.",
      "affectedActivity",
      HINDRANCE_LIMITS.affectedActivity,
    ),
    responsibleParty: input.responsibleParty,
    contractorId: input.responsibleParty === "contractor" ? contractorId : null,
    description: optionalLine(
      input.description,
      "description",
      HINDRANCE_LIMITS.description,
    ),
    signOff: hindranceSignOff(input.signOff, startDate, today),
  };
}

/** Open while it has no end date. */
export function hindranceStatus(end: CalendarDate | null): HindranceStatus {
  return end == null ? "open" : "closed";
}

/**
 * Calendar days lost, both ends counted: end − start + 1, or up to `today`
 * while open (never below 1 for a started hindrance).
 */
export function daysLost(
  start: CalendarDate,
  end: CalendarDate | null,
  today: CalendarDate,
): number {
  const last = end ?? today;
  return Math.max(1, daysBetween(start, last) + 1);
}

/** On the register for `date`: started on or before it and not ended before it. */
export function isOpenOn(
  hindrance: { startDate: CalendarDate; endDate: CalendarDate | null },
  date: CalendarDate,
): boolean {
  assertCalendarDate(date);
  return (
    hindrance.startDate <= date &&
    (hindrance.endDate == null || hindrance.endDate >= date)
  );
}

/** Overlaps the range `from`–`to` (either end open). */
export function overlapsRange(
  hindrance: { startDate: CalendarDate; endDate: CalendarDate | null },
  from: CalendarDate | null,
  to: CalendarDate | null,
): boolean {
  return (
    (to == null || hindrance.startDate <= to) &&
    (from == null || hindrance.endDate == null || hindrance.endDate >= from)
  );
}

/**
 * **Close**: sets the end date (on or after the start, not after today)
 * and, when given, the hours lost. An already closed hindrance is refused
 * with 409 `HINDRANCE_CLOSED`; edit it to change its end date.
 */
export function closeHindrance(
  current: {
    startDate: CalendarDate;
    endDate: CalendarDate | null;
    hoursLost: string | null;
  },
  input: { endDate: string; hoursLost?: string | number | null },
  today: CalendarDate,
): { endDate: CalendarDate; hoursLost: string | null } {
  if (current.endDate != null)
    throw new DomainError(
      "HINDRANCE_CLOSED",
      "This hindrance is already closed. Edit it to change the end date.",
      { kind: "conflict" },
    );
  const end = endDate(input.endDate, current.startDate, today);
  if (end == null)
    throw new DomainError(
      "HINDRANCE_END_REQUIRED",
      "Choose the date the hindrance ended.",
      { details: { field: "endDate" } },
    );
  const hours =
    input.hoursLost === undefined
      ? current.hoursLost
      : hoursLost(input.hoursLost);
  return { endDate: end, hoursLost: hours };
}
