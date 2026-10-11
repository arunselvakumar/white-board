import { normalizeMobile } from "@repo/auth/construction/mobile";

import { DomainError } from "@/src/shared-kernel/domain-error";
import { isGstStateCode } from "@/src/shared-kernel/gst-states";
import { isValidGstin, isValidPan } from "@/src/shared-kernel/tax-ids";

/**
 * An Other Party (Masters → Other Party, ADR CM-0017 §11): a counter-party
 * that is not a Contractor, Supplier, Labour or Vendor — a landlord, a
 * consultant, a buyer of scrap. Its purchase and sales invoices and
 * payments arrive with CM-708.
 */

export const OTHER_PARTY_NAME_MAX = 120;
export const OTHER_PARTY_EMAIL_MAX = 254;
export const OTHER_PARTY_ADDRESS_MAX = 500;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type OtherPartyInput = {
  name: string;
  mobile?: string | null;
  email?: string | null;
  gstin?: string | null;
  pan?: string | null;
  /**
   * GST state picked on the form. With a GSTIN the state is its first two
   * digits; a different pick is 400 `GSTIN_STATE_MISMATCH`.
   */
  stateCode?: string | null;
  address?: string | null;
};

export type OtherPartyDetails = {
  name: string;
  /** E.164. */
  mobile: string | null;
  /** Lower case. */
  email: string | null;
  /** Upper case, checksum valid. */
  gstin: string | null;
  pan: string | null;
  /** GST state code: the GSTIN's first two digits, or the one picked. */
  stateCode: string | null;
  address: string | null;
};

function field(code: string, message: string, name: string): DomainError {
  return new DomainError(code, message, { details: { field: name } });
}

function optional(raw: string | null | undefined): string | null {
  const value = raw?.trim().replace(/\s+/g, " ") ?? "";
  return value === "" ? null : value;
}

/** Checks and tidies every field of the Other Party form. */
export function otherPartyDetails(input: OtherPartyInput): OtherPartyDetails {
  const name = optional(input.name);
  if (name == null)
    throw field(
      "OTHER_PARTY_NAME_REQUIRED",
      "Enter the Other Party's name.",
      "name",
    );
  if (name.length > OTHER_PARTY_NAME_MAX)
    throw field(
      "OTHER_PARTY_NAME_TOO_LONG",
      `The name is at most ${String(OTHER_PARTY_NAME_MAX)} characters.`,
      "name",
    );

  const rawMobile = optional(input.mobile);
  const mobile = rawMobile == null ? null : normalizeMobile(rawMobile);
  if (rawMobile != null && mobile == null)
    throw field(
      "MOBILE_INVALID",
      "Enter a valid mobile number, like 77081 65767.",
      "mobile",
    );

  const email = optional(input.email)?.toLowerCase() ?? null;
  if (
    email != null &&
    (email.length > OTHER_PARTY_EMAIL_MAX || !EMAIL.test(email))
  )
    throw field("EMAIL_INVALID", "Enter a valid email address.", "email");

  const trimmedAddress = input.address?.trim() ?? "";
  const address = trimmedAddress === "" ? null : trimmedAddress;
  if (address != null && address.length > OTHER_PARTY_ADDRESS_MAX)
    throw field(
      "ADDRESS_TOO_LONG",
      `Address must be at most ${String(OTHER_PARTY_ADDRESS_MAX)} characters.`,
      "address",
    );

  const gstin = optional(input.gstin)?.toUpperCase() ?? null;
  if (gstin != null && !isValidGstin(gstin))
    throw field("GSTIN_INVALID", "Enter a valid 15-character GSTIN.", "gstin");
  const pan = optional(input.pan)?.toUpperCase() ?? null;
  if (pan != null && !isValidPan(pan))
    throw field("PAN_INVALID", "Enter a valid 10-character PAN.", "pan");
  if (gstin != null && pan != null && gstin.slice(2, 12) !== pan)
    throw field(
      "GSTIN_PAN_MISMATCH",
      "The GSTIN must contain the Other Party's PAN.",
      "gstin",
    );

  const picked = optional(input.stateCode);
  let stateCode: string | null = picked;
  if (gstin != null) {
    stateCode = gstin.slice(0, 2);
    if (picked != null && picked !== stateCode)
      throw field(
        "GSTIN_STATE_MISMATCH",
        `The GSTIN is registered in another state (code ${stateCode}). Pick that state, or leave the state to follow the GSTIN.`,
        "stateCode",
      );
  } else if (picked != null && !isGstStateCode(picked))
    throw field(
      "GST_STATE_INVALID",
      "Choose a state from the list.",
      "stateCode",
    );

  return { name, mobile, email, gstin, pan, stateCode, address };
}
