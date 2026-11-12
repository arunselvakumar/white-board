import { normalizeMobile } from "@repo/auth/construction/mobile";

import type { DomainError } from "@/src/shared-kernel/domain-error";
import { isGstStateCode } from "@/src/shared-kernel/gst-states";
import type { OwnScope } from "@/src/shared-kernel/access";
import { isValidGstin } from "@/src/shared-kernel/tax-ids";

import { invalidField } from "./marketing-errors";
import {
  MANUAL_STAGES,
  MARKETING_LIMITS,
  type CompanySource,
  type LostReason,
  type ManualStage,
  type Stage,
} from "./marketing-terms";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PIN = /^\d{6}$/;
/** An office line or a mobile: digits with spaces, dashes, brackets, a leading `+`. */
const PHONE = /^\+?[\d\s()-]+$/;
const WEBSITE = /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i;

/** Trims and collapses spaces; empty is null. */
export function optionalText(raw: string | null | undefined): string | null {
  const value = raw?.trim().replace(/\s+/g, " ") ?? "";
  return value === "" ? null : value;
}

/** Like `optionalText`, keeping line breaks (address, remarks). */
function optionalLines(raw: string | null | undefined): string | null {
  const value =
    raw
      ?.split("\n")
      .map((line) => line.trim().replace(/\s+/g, " "))
      .join("\n")
      .trim() ?? "";
  return value === "" ? null : value;
}

/**
 * What makes two names the same company: lower case, spaces collapsed
 * (PRD §3.3). Kept in `name_key` for the unique index.
 */
export function prospectCompanyNameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function limit(
  value: string | null,
  max: number,
  code: string,
  message: string,
  field: string,
): string | null {
  if (value != null && value.length > max)
    throw invalidField(code, message, field);
  return value;
}

/** Ten digits become `+91…`; any other must be `+` and 8–15 digits. */
export function contactMobile(
  raw: string | null | undefined,
  field = "mobile",
): string | null {
  const text = optionalText(raw);
  if (text == null) return null;
  const mobile = normalizeMobile(text);
  if (mobile == null)
    throw invalidField(
      "CONTACT_MOBILE_INVALID",
      "Enter a 10-digit mobile number, or one starting with + and the country code.",
      field,
    );
  return mobile;
}

function email(
  raw: string | null | undefined,
  code: string,
  field = "email",
): string | null {
  const text = optionalText(raw);
  if (text == null) return null;
  if (text.length > MARKETING_LIMITS.email || !EMAIL.test(text))
    throw invalidField(code, "Enter a valid email address.", field);
  return text;
}

export type ProspectCompanyDetailsInput = {
  name: string;
  industry?: string | null;
  address?: string | null;
  city?: string | null;
  stateCode?: string | null;
  pin?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  gstin?: string | null;
  source?: CompanySource | null;
  remarks?: string | null;
};

export type ProspectCompanyDetails = {
  name: string;
  industry: string | null;
  address: string | null;
  city: string | null;
  /** GST state code; the GSTIN's when it has one. */
  stateCode: string | null;
  pin: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  /** Upper case, checksum valid. */
  gstin: string | null;
  source: CompanySource | null;
  remarks: string | null;
};

/** Checks and tidies the company form (PRD §3.3, ADR CM-0040 §11). */
export function prospectCompanyDetails(
  input: ProspectCompanyDetailsInput,
): ProspectCompanyDetails {
  const name = optionalText(input.name);
  if (name == null)
    throw invalidField(
      "PROSPECT_COMPANY_NAME_REQUIRED",
      "Enter the company's name.",
      "name",
    );
  limit(
    name,
    MARKETING_LIMITS.name,
    "PROSPECT_COMPANY_NAME_TOO_LONG",
    `Keep the name to ${MARKETING_LIMITS.name} characters.`,
    "name",
  );

  const gstin = optionalText(input.gstin)?.toUpperCase() ?? null;
  if (gstin != null && !isValidGstin(gstin))
    throw invalidField(
      "PROSPECT_COMPANY_GSTIN_INVALID",
      "Enter a valid 15-character GSTIN.",
      "gstin",
    );

  let stateCode = optionalText(input.stateCode);
  if (stateCode != null && !isGstStateCode(stateCode))
    throw invalidField(
      "PROSPECT_COMPANY_STATE_INVALID",
      "Choose a state from the list.",
      "stateCode",
    );
  if (gstin != null) {
    const fromGstin = gstin.slice(0, 2);
    if (stateCode != null && stateCode !== fromGstin)
      throw invalidField(
        "PROSPECT_COMPANY_GSTIN_STATE_MISMATCH",
        "The GSTIN belongs to another state. Choose its state or leave the state empty.",
        "stateCode",
      );
    stateCode = fromGstin;
  }

  const pin = optionalText(input.pin)?.replace(/\s/g, "") ?? null;
  if (pin != null && !PIN.test(pin))
    throw invalidField(
      "PROSPECT_COMPANY_PIN_INVALID",
      "Enter the 6-digit PIN.",
      "pin",
    );

  const phone = optionalText(input.phone);
  if (
    phone != null &&
    (phone.length > MARKETING_LIMITS.phone ||
      !PHONE.test(phone) ||
      phone.replace(/\D/g, "").length < 6)
  )
    throw invalidField(
      "PROSPECT_COMPANY_PHONE_INVALID",
      "Enter a phone number: digits, with spaces or dashes if you like.",
      "phone",
    );

  const website = optionalText(input.website);
  if (
    website != null &&
    (website.length > MARKETING_LIMITS.website || !WEBSITE.test(website))
  )
    throw invalidField(
      "PROSPECT_COMPANY_WEBSITE_INVALID",
      "Enter a web address, like example.com.",
      "website",
    );

  const tooLong = (field: keyof typeof MARKETING_LIMITS, label: string) =>
    `Keep the ${label} to ${MARKETING_LIMITS[field]} characters.`;
  return {
    name,
    industry: limit(
      optionalText(input.industry),
      MARKETING_LIMITS.industry,
      "PROSPECT_COMPANY_INDUSTRY_TOO_LONG",
      tooLong("industry", "industry"),
      "industry",
    ),
    address: limit(
      optionalLines(input.address),
      MARKETING_LIMITS.address,
      "PROSPECT_COMPANY_ADDRESS_TOO_LONG",
      tooLong("address", "address"),
      "address",
    ),
    city: limit(
      optionalText(input.city),
      MARKETING_LIMITS.city,
      "PROSPECT_COMPANY_CITY_TOO_LONG",
      tooLong("city", "city"),
      "city",
    ),
    stateCode,
    pin,
    phone,
    email: email(input.email, "PROSPECT_COMPANY_EMAIL_INVALID"),
    website,
    gstin,
    source: input.source ?? null,
    remarks: limit(
      optionalLines(input.remarks),
      MARKETING_LIMITS.remarks,
      "PROSPECT_COMPANY_REMARKS_TOO_LONG",
      tooLong("remarks", "remarks"),
      "remarks",
    ),
  };
}

export type ContactDetailsInput = {
  name: string;
  jobTitle?: string | null;
  mobile?: string | null;
  email?: string | null;
  remarks?: string | null;
};

export type ContactDetails = {
  name: string;
  jobTitle: string | null;
  /** E.164. */
  mobile: string | null;
  email: string | null;
  remarks: string | null;
};

/** Checks and tidies a Contact (PRD §3.3). */
export function contactDetails(input: ContactDetailsInput): ContactDetails {
  const name = optionalText(input.name);
  if (name == null)
    throw invalidField(
      "CONTACT_NAME_REQUIRED",
      "Enter the Contact's name.",
      "name",
    );
  limit(
    name,
    MARKETING_LIMITS.name,
    "CONTACT_NAME_TOO_LONG",
    `Keep the name to ${MARKETING_LIMITS.name} characters.`,
    "name",
  );
  return {
    name,
    jobTitle: limit(
      optionalText(input.jobTitle),
      MARKETING_LIMITS.jobTitle,
      "CONTACT_JOB_TITLE_TOO_LONG",
      `Keep the job title to ${MARKETING_LIMITS.jobTitle} characters.`,
      "jobTitle",
    ),
    mobile: contactMobile(input.mobile),
    email: email(input.email, "CONTACT_EMAIL_INVALID"),
    remarks: limit(
      optionalLines(input.remarks),
      MARKETING_LIMITS.remarks,
      "CONTACT_REMARKS_TOO_LONG",
      `Keep the remarks to ${MARKETING_LIMITS.remarks} characters.`,
      "remarks",
    ),
  };
}

export type StageMove = {
  stage: Stage;
  lostReason: LostReason | null;
  lostReasonText: string | null;
};

/**
 * A move by hand (ADR CM-0040 §11): to any Stage after Contacted, in any
 * order. Lost needs a Lost Reason, and "Other" needs words; leaving Lost
 * clears them.
 */
export function manualStageMove(
  current: Stage,
  input: {
    stage: string;
    lostReason?: LostReason | null;
    lostReasonText?: string | null;
  },
): StageMove {
  if (!(MANUAL_STAGES as readonly string[]).includes(input.stage))
    throw invalidField(
      "STAGE_NOT_MANUAL",
      "New and Contacted are set by the system. Choose a later Stage.",
      "stage",
    );
  const stage = input.stage as ManualStage;
  if (stage === current)
    throw invalidField(
      "STAGE_UNCHANGED",
      "The company is already at this Stage.",
      "stage",
    );
  if (stage !== "lost")
    return { stage, lostReason: null, lostReasonText: null };
  const lostReason = input.lostReason ?? null;
  if (lostReason == null)
    throw invalidField(
      "LOST_REASON_REQUIRED",
      "Choose why the company was lost.",
      "lostReason",
    );
  const text = optionalText(input.lostReasonText);
  if (lostReason === "other" && text == null)
    throw invalidField(
      "LOST_REASON_TEXT_REQUIRED",
      "Say why the company was lost.",
      "lostReasonText",
    );
  if (text != null && text.length > MARKETING_LIMITS.lostReasonText)
    throw invalidField(
      "LOST_REASON_TEXT_TOO_LONG",
      `Keep the reason to ${MARKETING_LIMITS.lostReasonText} characters.`,
      "lostReasonText",
    );
  return {
    stage,
    lostReason,
    lostReasonText: lostReason === "other" ? text : null,
  };
}

/**
 * Whether a member without View all sees a Prospect Company (ADR CM-0040
 * §5): they created it, or it is assigned to them. Its Contacts and Stage
 * changes go with it.
 */
export function isProspectCompanyVisible(
  company: { createdBy: string; assignedMemberId: string | null },
  scope: OwnScope,
): boolean {
  if (scope == null) return true;
  if (company.createdBy === scope.userId) return true;
  return scope.memberId != null && company.assignedMemberId === scope.memberId;
}

/** Thrown when a write would leave a company with Contacts but no primary. */
export function primaryContactRequired(): DomainError {
  return invalidField(
    "CONTACT_PRIMARY_REQUIRED",
    "One Contact must stay primary. Make another Contact primary instead.",
    "isPrimary",
  );
}
