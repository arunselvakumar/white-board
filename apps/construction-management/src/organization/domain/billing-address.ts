import {
  DomainError,
  conflict,
  notFound,
} from "@/src/shared-kernel/domain-error";
import { gstStateName } from "@/src/shared-kernel/gst-states";
import { isValidGstin } from "@/src/shared-kernel/tax-ids";

/**
 * An address the Company bills from, with its GST registration (CM-501,
 * ADR CM-0015 §1, §6). Purchase Orders copy the address text and GSTIN, so
 * deleting one never touches a document. One live address is the default.
 */
export const BILLING_ADDRESS_NAME_MAX = 120;
export const BILLING_ADDRESS_ADDRESS_MAX = 500;

export type BillingAddressInput = {
  name: string;
  address: string;
  stateCode: string;
  gstin?: string | null | undefined;
};

export type BillingAddressDetails = {
  /** Spaces collapsed. */
  name: string;
  /** Trimmed; line breaks kept. */
  address: string;
  /** A GST state code of `GST_STATES`. */
  stateCode: string;
  /** Upper case, checksum valid, starts with `stateCode`. */
  gstin: string | null;
};

export type BillingAddress = BillingAddressDetails & {
  id: string;
  workspaceId: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/** What the audit log keeps of an address. */
export type BillingAddressSnapshot = BillingAddressDetails & {
  isDefault: boolean;
};

function collapsed(raw: string | null | undefined): string {
  return raw?.trim().replace(/\s+/g, " ") ?? "";
}

/** Checks and tidies the Add / Edit form. */
export function billingAddressDetails(
  input: BillingAddressInput,
): BillingAddressDetails {
  const name = collapsed(input.name);
  if (name === "")
    throw new DomainError(
      "BILLING_ADDRESS_NAME_REQUIRED",
      "Enter a name for this billing address.",
    );
  if (name.length > BILLING_ADDRESS_NAME_MAX)
    throw new DomainError(
      "BILLING_ADDRESS_NAME_TOO_LONG",
      `Name must be at most ${String(BILLING_ADDRESS_NAME_MAX)} characters.`,
    );

  const address = input.address.trim();
  if (address === "")
    throw new DomainError("ADDRESS_REQUIRED", "Enter the address.");
  if (address.length > BILLING_ADDRESS_ADDRESS_MAX)
    throw new DomainError(
      "ADDRESS_TOO_LONG",
      `Address must be at most ${String(BILLING_ADDRESS_ADDRESS_MAX)} characters.`,
    );

  const stateCode = input.stateCode.trim();
  if (gstStateName(stateCode) == null)
    throw new DomainError("GST_STATE_INVALID", "Choose the GST state.");

  const rawGstin = collapsed(input.gstin).toUpperCase();
  const gstin = rawGstin === "" ? null : rawGstin;
  if (gstin != null && !isValidGstin(gstin))
    throw new DomainError("GSTIN_INVALID", "Enter a valid 15-character GSTIN.");
  if (gstin != null && gstin.slice(0, 2) !== stateCode)
    throw new DomainError(
      "GSTIN_STATE_MISMATCH",
      `A GSTIN of ${gstStateName(stateCode) ?? stateCode} starts with ${stateCode}.`,
    );

  return { name, address, stateCode, gstin };
}

export function billingAddressSnapshot(
  address: BillingAddressDetails & { isDefault: boolean },
): BillingAddressSnapshot {
  return {
    name: address.name,
    address: address.address,
    stateCode: address.stateCode,
    gstin: address.gstin,
    isDefault: address.isDefault,
  };
}

/** Default first, then by name. */
export function compareBillingAddresses(
  a: Pick<BillingAddress, "isDefault" | "name">,
  b: Pick<BillingAddress, "isDefault" | "name">,
): number {
  return (
    Number(b.isDefault) - Number(a.isDefault) ||
    a.name.localeCompare(b.name, "en", { sensitivity: "base" })
  );
}

export function billingAddressNotFound(): DomainError {
  return notFound(
    "BILLING_ADDRESS_NOT_FOUND",
    "This billing address was not found.",
  );
}

export function billingAddressNameInUse(): DomainError {
  return conflict(
    "BILLING_ADDRESS_NAME_IN_USE",
    "Another billing address already has this name.",
  );
}

export function billingAddressChanged(): DomainError {
  return conflict(
    "BILLING_ADDRESS_CHANGED",
    "Someone else changed this billing address after you opened it. Reload to see their changes.",
  );
}
