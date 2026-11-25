import { ageInMonths, formatAge, type IsoDate } from "./dates";
import { conflict, invalid } from "./errors";

export const CHILD_STATUSES = ["active", "withdrawn", "graduated"] as const;
export type ChildStatus = (typeof CHILD_STATUSES)[number];

export const GENDERS = ["girl", "boy", "other"] as const;
export type Gender = (typeof GENDERS)[number];

export const BLOOD_GROUPS = [
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
  "O+",
  "O-",
] as const;

export const MAX_AUTHORISED_PICKUPS = 6;

/** "<centre code>-<sequence, at least 4 digits>": "MAIN-0007". */
export function formatAdmissionNumber(
  centreCode: string,
  sequence: number,
): string {
  return `${centreCode}-${String(sequence).padStart(4, "0")}`;
}

/** A Child needs a phone for the father or the mother: 400 `PARENT_PHONE_REQUIRED`. */
export function assertParentPhone(parents: {
  fatherPhone: string | null;
  motherPhone: string | null;
}): void {
  if (parents.fatherPhone == null && parents.motherPhone == null)
    throw invalid(
      "PARENT_PHONE_REQUIRED",
      "Enter a phone number for the father or the mother.",
    );
}

/** A withdrawn or graduated Child's record can only be read: 409 `CHILD_NOT_ACTIVE`. */
export function assertChildActive(status: ChildStatus): void {
  if (status !== "active")
    throw conflict(
      "CHILD_NOT_ACTIVE",
      status === "withdrawn"
        ? "This Child has been withdrawn. Their record can only be read."
        : "This Child has graduated. Their record can only be read.",
    );
}

export function assertPickupCount(count: number): void {
  if (count > MAX_AUTHORISED_PICKUPS)
    throw invalid(
      "TOO_MANY_PICKUPS",
      `A Child can have at most ${String(MAX_AUTHORISED_PICKUPS)} Authorised Pickups.`,
    );
}

/** Trimmed and lower case; blank is null. Parents are linked by email. */
export function normaliseEmail(raw: string | null | undefined): string | null {
  const email = raw?.trim().toLowerCase() ?? "";
  return email === "" ? null : email;
}

export function childName(first: string, last: string | null): string {
  return last == null || last === "" ? first : `${first} ${last}`;
}

/** "3 y 4 m" on `on`. */
export function ageText(dateOfBirth: IsoDate, on: IsoDate): string {
  return formatAge(ageInMonths(dateOfBirth, on));
}

/**
 * Parent emails on a record that were not on it before, without repeats:
 * the addresses to invite after a change.
 */
export function addedParentEmails(
  before: readonly (string | null)[],
  after: readonly (string | null)[],
): string[] {
  const known = new Set(before.filter((email) => email != null));
  return [
    ...new Set(
      after.filter(
        (email): email is string => email != null && !known.has(email),
      ),
    ),
  ];
}
