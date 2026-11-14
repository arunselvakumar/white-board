import type { CheckInPerson } from "@/src/queries/check-ins";

/** A phone search needs this many digits, so "42" finds an ID, not every phone. */
export const PHONE_DIGITS_MIN = 3;

function digitsOf(text: string): string {
  return text.replace(/\D/g, "");
}

/**
 * Whether a person matches what the operator typed: any part of the name,
 * role or ID, ignoring case; or, from three digits up, any part of the
 * phone on digits alone, so spaces, "+91" and a leading zero do not matter.
 */
export function matchesPerson(person: CheckInPerson, typed: string): boolean {
  const query = typed.trim().toLowerCase();
  if (query === "") return true;
  const text = [person.name, person.role, person.code]
    .filter((part): part is string => part != null)
    .some((part) => part.toLowerCase().includes(query));
  if (text) return true;
  if (person.phone == null) return false;
  const digits = digitsOf(query).replace(/^0+/, "");
  if (digits.length < PHONE_DIGITS_MIN) return false;
  // A query that only holds digits and separators is a phone number.
  if (/[^\d\s+()-]/.test(query)) return false;
  return digitsOf(person.phone).includes(digits);
}
