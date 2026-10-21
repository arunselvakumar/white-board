import { normalizeMobile } from "@repo/auth/construction/mobile";

import {
  DomainError,
  conflict,
  notFound,
} from "@/src/shared-kernel/domain-error";
import { isGstStateCode } from "@/src/shared-kernel/gst-states";
import { isValidGstin, isValidPan } from "@/src/shared-kernel/tax-ids";

/**
 * A Client (Masters → Clients, ADR CM-0023 §2): who a Contract work
 * Project is built for and billed. A Company-level record, not a User.
 * Client bills (CM-1107) are addressed to it, with its GSTIN, state and
 * billing address.
 */

export const CLIENT_NAME_MAX = 120;
export const CLIENT_CONTACT_PERSON_MAX = 120;
export const CLIENT_EMAIL_MAX = 254;
export const CLIENT_ADDRESS_MAX = 500;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** An Indian PIN code: six digits, not starting with 0. */
const PIN_CODE = /^[1-9][0-9]{5}$/;
/** Tax deduction account number: four letters, five digits, one letter. */
const TAN = /^[A-Z]{4}[0-9]{5}[A-Z]$/;

/** Six digits, the first not 0. */
export function isValidPinCode(raw: string): boolean {
  return PIN_CODE.test(raw.trim());
}

/** `AAAA99999A`: four letters, five digits, one letter. */
export function isValidTan(raw: string): boolean {
  return TAN.test(raw.trim().toUpperCase());
}

export type ClientInput = {
  name: string;
  contactPerson?: string | null;
  mobile?: string | null;
  email?: string | null;
  /** Billing address, printed on tax invoices. */
  address?: string | null;
  pinCode?: string | null;
  gstin?: string | null;
  pan?: string | null;
  tan?: string | null;
  /**
   * GST state picked on the form. With a GSTIN the state is its first two
   * digits; a different pick is 400 `GSTIN_STATE_MISMATCH`.
   */
  stateCode?: string | null;
};

export type ClientDetails = {
  name: string;
  contactPerson: string | null;
  /** E.164. */
  mobile: string | null;
  /** Lower case. */
  email: string | null;
  address: string | null;
  pinCode: string | null;
  /** Upper case, checksum valid. */
  gstin: string | null;
  pan: string | null;
  tan: string | null;
  /** GST state code: the GSTIN's first two digits, or the one picked. */
  stateCode: string | null;
};

function field(code: string, message: string, name: string): DomainError {
  return new DomainError(code, message, { details: { field: name } });
}

function optional(raw: string | null | undefined): string | null {
  const value = raw?.trim().replace(/\s+/g, " ") ?? "";
  return value === "" ? null : value;
}

/** Checks and tidies every field of the Client form. */
export function clientDetails(input: ClientInput): ClientDetails {
  const name = optional(input.name);
  if (name == null)
    throw field("CLIENT_NAME_REQUIRED", "Enter the Client's name.", "name");
  if (name.length > CLIENT_NAME_MAX)
    throw field(
      "CLIENT_NAME_TOO_LONG",
      `The name is at most ${String(CLIENT_NAME_MAX)} characters.`,
      "name",
    );

  const contactPerson = optional(input.contactPerson);
  if (contactPerson != null && contactPerson.length > CLIENT_CONTACT_PERSON_MAX)
    throw field(
      "CONTACT_PERSON_TOO_LONG",
      `Contact person must be at most ${String(CLIENT_CONTACT_PERSON_MAX)} characters.`,
      "contactPerson",
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
  if (email != null && (email.length > CLIENT_EMAIL_MAX || !EMAIL.test(email)))
    throw field("EMAIL_INVALID", "Enter a valid email address.", "email");

  const trimmedAddress = input.address?.trim() ?? "";
  const address = trimmedAddress === "" ? null : trimmedAddress;
  if (address != null && address.length > CLIENT_ADDRESS_MAX)
    throw field(
      "ADDRESS_TOO_LONG",
      `Address must be at most ${String(CLIENT_ADDRESS_MAX)} characters.`,
      "address",
    );

  const pinCode = optional(input.pinCode)?.replace(/\s/g, "") ?? null;
  if (pinCode != null && !isValidPinCode(pinCode))
    throw field("PIN_CODE_INVALID", "Enter the 6-digit PIN code.", "pinCode");

  const gstin = optional(input.gstin)?.toUpperCase() ?? null;
  if (gstin != null && !isValidGstin(gstin))
    throw field("GSTIN_INVALID", "Enter a valid 15-character GSTIN.", "gstin");
  const pan = optional(input.pan)?.toUpperCase() ?? null;
  if (pan != null && !isValidPan(pan))
    throw field("PAN_INVALID", "Enter a valid 10-character PAN.", "pan");
  if (gstin != null && pan != null && gstin.slice(2, 12) !== pan)
    throw field(
      "GSTIN_PAN_MISMATCH",
      "The GSTIN must contain the Client's PAN.",
      "gstin",
    );
  const tan = optional(input.tan)?.toUpperCase() ?? null;
  if (tan != null && !isValidTan(tan))
    throw field(
      "TAN_INVALID",
      "Enter a valid 10-character TAN, like CHEA12345B.",
      "tan",
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

  return {
    name,
    contactPerson,
    mobile,
    email,
    address,
    pinCode,
    gstin,
    pan,
    tan,
    stateCode,
  };
}

export const clientNotFound = () =>
  notFound("CLIENT_NOT_FOUND", "This Client was not found.");

export const clientNameTaken = (name: string) =>
  conflict("CLIENT_NAME_TAKEN", `A Client named “${name}” already exists.`, {
    field: "name",
  });

export const clientChanged = () =>
  conflict(
    "CLIENT_CHANGED",
    "Someone changed this Client after you opened it. Reload to see the latest.",
  );

/** A live Project names the Client (ADR CM-0023 §2). */
export const clientInUse = (projectCount: number) =>
  conflict(
    "CLIENT_IN_USE",
    projectCount === 1
      ? "A Project is linked to this Client, so it cannot be deleted. Change that Project's Client first, or make the Client inactive."
      : `${String(projectCount)} Projects are linked to this Client, so it cannot be deleted. Change their Client first, or make the Client inactive.`,
    { projectCount },
  );
