import { DomainError } from "@/src/shared-kernel/domain-error";
import { isValidGstin, isValidPan } from "@/src/shared-kernel/tax-ids";

import { countryByCode, isCurrency, isTimezone } from "./countries";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164 = /^\+[1-9]\d{7,14}$/;

export type CompanyDetailsValue = {
  name: string;
  /** E.164. */
  mobile: string | null;
  email: string | null;
  /** ISO 3166-1 alpha-2. */
  country: string;
  /** ISO 4217. */
  currency: string;
  gstin: string | null;
  pan: string | null;
  address: string | null;
  timezone: string;
};

function optional(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * A Company's name, contact, country and tax ids (`modules/01`
 * Organization). GSTIN and PAN apply to Indian Companies only.
 */
export class CompanyDetails {
  static readonly NAME_MAX = 120;
  static readonly ADDRESS_MAX = 500;

  private constructor(readonly value: CompanyDetailsValue) {}

  get isIndian(): boolean {
    return this.value.country === "IN";
  }

  static create(input: {
    name: string;
    mobile?: string | null;
    email?: string | null;
    country: string;
    currency?: string | null;
    gstin?: string | null;
    pan?: string | null;
    address?: string | null;
    timezone?: string | null;
  }): CompanyDetails {
    const name = input.name.trim();
    if (name.length === 0)
      throw new DomainError("COMPANY_NAME_REQUIRED", "Enter the Company name.");
    if (name.length > CompanyDetails.NAME_MAX)
      throw new DomainError(
        "COMPANY_NAME_TOO_LONG",
        `Company name must be at most ${String(CompanyDetails.NAME_MAX)} characters.`,
      );

    const country = countryByCode(input.country);
    if (country == null)
      throw new DomainError("COUNTRY_INVALID", "Choose a listed country.");

    const currency = optional(input.currency) ?? country.currency;
    if (!isCurrency(currency))
      throw new DomainError("CURRENCY_INVALID", "Choose a listed currency.");

    const timezone = optional(input.timezone) ?? country.timezone;
    if (!isTimezone(timezone))
      throw new DomainError("TIMEZONE_INVALID", "Choose a listed time zone.");

    const mobile = optional(input.mobile);
    if (mobile != null && !E164.test(mobile))
      throw new DomainError("MOBILE_INVALID", "Enter a valid mobile number.");

    const email = optional(input.email)?.toLowerCase() ?? null;
    if (email != null && !EMAIL.test(email))
      throw new DomainError("EMAIL_INVALID", "Enter a valid email address.");

    const isIndian = country.code === "IN";
    let gstin = optional(input.gstin)?.toUpperCase() ?? null;
    let pan = optional(input.pan)?.toUpperCase() ?? null;
    if (!isIndian) {
      gstin = null;
      pan = null;
    }
    if (gstin != null && !isValidGstin(gstin))
      throw new DomainError(
        "GSTIN_INVALID",
        "Enter a valid 15-character GSTIN.",
      );
    if (pan != null && !isValidPan(pan))
      throw new DomainError("PAN_INVALID", "Enter a valid 10-character PAN.");
    if (gstin != null && pan != null && gstin.slice(2, 12) !== pan)
      throw new DomainError(
        "GSTIN_PAN_MISMATCH",
        "The GSTIN must contain the Company PAN.",
      );

    const address = optional(input.address);
    if (address != null && address.length > CompanyDetails.ADDRESS_MAX)
      throw new DomainError(
        "ADDRESS_TOO_LONG",
        `Address must be at most ${String(CompanyDetails.ADDRESS_MAX)} characters.`,
      );

    return new CompanyDetails({
      name,
      mobile,
      email,
      country: country.code,
      currency,
      gstin,
      pan,
      address,
      timezone,
    });
  }
}
