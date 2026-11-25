import { isIsoDate, type IsoDate } from "./dates";
import { conflict, invalid } from "./errors";

export type CentreOwnership = "company_owned" | "franchised";
export type CentreStatus = "active" | "closed";

/** 2–6 upper-case letters or digits; prefixes Admission and Receipt numbers. */
const CENTRE_CODE = /^[A-Z0-9]{2,6}$/;
const PINCODE = /^[1-9]\d{5}$/;

/** Royalty in basis points: 1000 is 10%. */
export const MAX_ROYALTY_BPS = 10_000;

export type CentreDetails = {
  name: string;
  code: string;
  phone: string | null;
  email: string | null;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  /** Six digits, Indian PIN code. */
  pincode: string | null;
};

export type FranchiseTerms = {
  ownership: CentreOwnership;
  franchiseeName: string | null;
  franchiseePhone: string | null;
  franchiseeEmail: string | null;
  agreementStartOn: IsoDate | null;
  agreementEndOn: IsoDate | null;
  /** 0–10000. */
  royaltyBps: number;
  /** The Centre may change the Head Office Fee Structure's amounts. */
  mayOverrideFees: boolean;
};

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

/** Upper case and trimmed, so "ls an " and "LSAN" are the same code. */
export function normaliseCentreCode(code: string): string {
  return code.trim().toUpperCase();
}

/** A Centre's name and contact details, trimmed, with blanks as null. */
export function centreDetails(input: {
  name: string;
  code: string;
  phone?: string | null;
  email?: string | null;
  addressLine?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
}): CentreDetails {
  const name = input.name.trim();
  if (name === "")
    throw invalid("CENTRE_NAME_REQUIRED", "Enter the Centre's name.");
  const code = normaliseCentreCode(input.code);
  if (!CENTRE_CODE.test(code))
    throw invalid(
      "CENTRE_CODE_INVALID",
      "The Centre code is 2 to 6 letters or digits.",
    );
  const pincode = blankToNull(input.pincode);
  if (pincode != null && !PINCODE.test(pincode))
    throw invalid("PINCODE_INVALID", "A PIN code is 6 digits.");
  return {
    name,
    code,
    phone: blankToNull(input.phone),
    email: blankToNull(input.email)?.toLowerCase() ?? null,
    addressLine: blankToNull(input.addressLine),
    city: blankToNull(input.city),
    state: blankToNull(input.state),
    pincode,
  };
}

/**
 * A royalty percentage, 0–100 with at most two decimals, in basis points.
 * 12.5 → 1250.
 */
export function royaltyPercentToBps(percent: number): number {
  const bps = Math.round(percent * 100);
  if (
    !Number.isFinite(percent) ||
    Math.abs(percent * 100 - bps) > 1e-6 ||
    bps < 0 ||
    bps > MAX_ROYALTY_BPS
  )
    throw invalid(
      "ROYALTY_INVALID",
      "Royalty is 0 to 100%, with at most two decimals.",
    );
  return bps;
}

/** 1250 → 12.5. */
export function royaltyBpsToPercent(bps: number): number {
  return bps / 100;
}

/**
 * How a Centre is owned. A Company-owned Centre keeps no franchisee and
 * pays no royalty; a Franchised one needs the franchisee's name, and its
 * agreement cannot end before it starts.
 */
export function franchiseTerms(input: {
  ownership: CentreOwnership;
  franchiseeName?: string | null;
  franchiseePhone?: string | null;
  franchiseeEmail?: string | null;
  agreementStartOn?: IsoDate | null;
  agreementEndOn?: IsoDate | null;
  royaltyPercent?: number | null;
  mayOverrideFees: boolean;
}): FranchiseTerms {
  if (input.ownership === "company_owned")
    return {
      ownership: "company_owned",
      franchiseeName: null,
      franchiseePhone: null,
      franchiseeEmail: null,
      agreementStartOn: null,
      agreementEndOn: null,
      royaltyBps: 0,
      mayOverrideFees: input.mayOverrideFees,
    };
  const franchiseeName = blankToNull(input.franchiseeName);
  if (franchiseeName == null)
    throw invalid(
      "FRANCHISEE_NAME_REQUIRED",
      "A Franchised Centre needs the franchisee's name.",
    );
  const startsOn = input.agreementStartOn ?? null;
  const endsOn = input.agreementEndOn ?? null;
  for (const date of [startsOn, endsOn])
    if (date != null && !isIsoDate(date))
      throw invalid("AGREEMENT_DATE_INVALID", "Use a YYYY-MM-DD date.");
  if (startsOn != null && endsOn != null && endsOn < startsOn)
    throw invalid(
      "AGREEMENT_DATES_INVALID",
      "The agreement cannot end before it starts.",
    );
  return {
    ownership: "franchised",
    franchiseeName,
    franchiseePhone: blankToNull(input.franchiseePhone),
    franchiseeEmail: blankToNull(input.franchiseeEmail)?.toLowerCase() ?? null,
    agreementStartOn: startsOn,
    agreementEndOn: endsOn,
    royaltyBps: royaltyPercentToBps(input.royaltyPercent ?? 0),
    mayOverrideFees: input.mayOverrideFees,
  };
}

/** A Centre with Children still admitted cannot close. */
export function assertCanClose(
  centre: { status: CentreStatus },
  activeChildren: number,
): void {
  if (centre.status === "closed")
    throw conflict("CENTRE_ALREADY_CLOSED", "This Centre is already closed.");
  if (activeChildren > 0)
    throw conflict(
      "CENTRE_HAS_ACTIVE_CHILDREN",
      `This Centre still has ${activeChildren} active ${activeChildren === 1 ? "Child" : "Children"}. Withdraw or transfer them first.`,
      { activeChildren },
    );
}

export function assertCanReopen(centre: { status: CentreStatus }): void {
  if (centre.status !== "closed")
    throw conflict("CENTRE_NOT_CLOSED", "This Centre is open.");
}
