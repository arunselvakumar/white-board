import { normalizeMobile } from "@repo/auth/construction/mobile";

import {
  DomainError,
  conflict,
  notFound,
} from "@/src/shared-kernel/domain-error";
import { isGstStateCode } from "@/src/shared-kernel/gst-states";
import { isValidGstin, isValidPan } from "@/src/shared-kernel/tax-ids";

/**
 * The two minimal party masters M4 ships for Project Resources (ADR
 * CM-0013 §6): Contractors (who execute work, by Department) and Suppliers
 * (who sell material). CM-501 adds quotations, opening balances and the
 * procurement fields.
 */
export const PARTY_KINDS = ["contractor", "supplier"] as const;
export type PartyKind = (typeof PARTY_KINDS)[number];

type PartyKindInfo = {
  /** Prefix of the kind's error codes: `CONTRACTOR_NAME_IN_USE`. */
  code: string;
  label: string;
  plural: string;
};

export const PARTY_KIND_INFO: Record<PartyKind, PartyKindInfo> = {
  contractor: {
    code: "CONTRACTOR",
    label: "Contractor",
    plural: "Contractors",
  },
  supplier: { code: "SUPPLIER", label: "Supplier", plural: "Suppliers" },
};

export const PARTY_NAME_MAX = 120;
export const PARTY_CONTACT_PERSON_MAX = 120;
export const PARTY_EMAIL_MAX = 254;
export const PARTY_ADDRESS_MAX = 500;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type PartyDetailsInput = {
  name: string;
  contactPerson?: string | null;
  mobile?: string | null;
  email?: string | null;
  address?: string | null;
  gstin?: string | null;
  pan?: string | null;
  /**
   * GST state picked on the form. With a GSTIN the state is its first two
   * digits, and a different pick is 400 `GSTIN_STATE_MISMATCH` (CM-501).
   */
  stateCode?: string | null;
  /** A Contractor's second contact; ignored for a Supplier. */
  contactPerson2?: string | null;
  mobile2?: string | null;
};

export type PartyDetails = {
  name: string;
  contactPerson: string | null;
  /** E.164. */
  mobile: string | null;
  /** Lower case. */
  email: string | null;
  address: string | null;
  /** Upper case, checksum valid. */
  gstin: string | null;
  pan: string | null;
  /** GST state code: the GSTIN's first two digits, or the one picked. */
  stateCode: string | null;
  /** A Contractor's second contact; always null for a Supplier. */
  contactPerson2: string | null;
  /** E.164. */
  mobile2: string | null;
};

export type PartyProps = PartyDetails & {
  id: string;
  workspaceId: string;
  kind: PartyKind;
  isActive: boolean;
  /** Departments a Contractor works in; always empty for a Supplier. */
  departmentIds: string[];
  /** Projects the party is assigned to (Resources). */
  projectIds: string[];
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  deletedAt: Date | null;
  deletedBy: string | null;
};

export type PartySnapshot = PartyDetails & {
  isActive: boolean;
  departmentIds: string[];
  projectIds: string[];
};

function optional(raw: string | null | undefined): string | null {
  const value = raw?.trim().replace(/\s+/g, " ") ?? "";
  return value === "" ? null : value;
}

/** Checks and tidies every field of the form (ADR CM-0013 §6). */
export function partyDetails(
  kind: PartyKind,
  input: PartyDetailsInput,
): PartyDetails {
  const { code, label } = PARTY_KIND_INFO[kind];
  const name = optional(input.name);
  if (name == null)
    throw new DomainError(`${code}_NAME_REQUIRED`, `Enter the ${label} name.`);
  if (name.length > PARTY_NAME_MAX)
    throw new DomainError(
      `${code}_NAME_TOO_LONG`,
      `${label} name must be at most ${String(PARTY_NAME_MAX)} characters.`,
    );

  const contactPerson = optional(input.contactPerson);
  if (contactPerson != null && contactPerson.length > PARTY_CONTACT_PERSON_MAX)
    throw new DomainError(
      "CONTACT_PERSON_TOO_LONG",
      `Contact person must be at most ${String(PARTY_CONTACT_PERSON_MAX)} characters.`,
    );

  const rawMobile = optional(input.mobile);
  const mobile = rawMobile == null ? null : normalizeMobile(rawMobile);
  if (rawMobile != null && mobile == null)
    throw new DomainError(
      "MOBILE_INVALID",
      "Enter a valid mobile number, like 77081 65767.",
    );

  const email = optional(input.email)?.toLowerCase() ?? null;
  if (email != null && (email.length > PARTY_EMAIL_MAX || !EMAIL.test(email)))
    throw new DomainError("EMAIL_INVALID", "Enter a valid email address.");

  const trimmedAddress = input.address?.trim() ?? "";
  const address = trimmedAddress === "" ? null : trimmedAddress;
  if (address != null && address.length > PARTY_ADDRESS_MAX)
    throw new DomainError(
      "ADDRESS_TOO_LONG",
      `Address must be at most ${String(PARTY_ADDRESS_MAX)} characters.`,
    );

  const gstin = optional(input.gstin)?.toUpperCase() ?? null;
  if (gstin != null && !isValidGstin(gstin))
    throw new DomainError("GSTIN_INVALID", "Enter a valid 15-character GSTIN.");
  const pan = optional(input.pan)?.toUpperCase() ?? null;
  if (pan != null && !isValidPan(pan))
    throw new DomainError("PAN_INVALID", "Enter a valid 10-character PAN.");
  if (gstin != null && pan != null && gstin.slice(2, 12) !== pan)
    throw new DomainError(
      "GSTIN_PAN_MISMATCH",
      `The GSTIN must contain the ${label}'s PAN.`,
    );

  const picked = optional(input.stateCode);
  let stateCode: string | null = picked;
  if (gstin != null) {
    stateCode = gstin.slice(0, 2);
    if (picked != null && picked !== stateCode)
      throw new DomainError(
        "GSTIN_STATE_MISMATCH",
        `The GSTIN is registered in another state (code ${stateCode}). Pick that state, or leave the state to follow the GSTIN.`,
      );
  } else if (picked != null && !isGstStateCode(picked))
    throw new DomainError("GST_STATE_INVALID", "Choose a state from the list.");

  let contactPerson2: string | null = null;
  let mobile2: string | null = null;
  if (kind === "contractor") {
    contactPerson2 = optional(input.contactPerson2);
    if (
      contactPerson2 != null &&
      contactPerson2.length > PARTY_CONTACT_PERSON_MAX
    )
      throw new DomainError(
        "CONTACT_PERSON_2_TOO_LONG",
        `Contact person 2 must be at most ${String(PARTY_CONTACT_PERSON_MAX)} characters.`,
      );
    const rawMobile2 = optional(input.mobile2);
    mobile2 = rawMobile2 == null ? null : normalizeMobile(rawMobile2);
    if (rawMobile2 != null && mobile2 == null)
      throw new DomainError(
        "MOBILE_2_INVALID",
        "Enter a valid mobile number for contact person 2, like 77081 65767.",
      );
  }

  return {
    name,
    contactPerson,
    mobile,
    email,
    address,
    gstin,
    pan,
    stateCode,
    contactPerson2,
    mobile2,
  };
}

function unique(ids: readonly string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

export function partyNotFound(kind: PartyKind): DomainError {
  const { code, label } = PARTY_KIND_INFO[kind];
  return notFound(`${code}_NOT_FOUND`, `This ${label} was not found.`);
}

export function partyNameInUse(kind: PartyKind): DomainError {
  const { code, label } = PARTY_KIND_INFO[kind];
  return conflict(
    `${code}_NAME_IN_USE`,
    `A ${label} with this name already exists.`,
  );
}

export function partyChanged(kind: PartyKind): DomainError {
  const { code, label } = PARTY_KIND_INFO[kind];
  return conflict(
    `${code}_CHANGED`,
    `Someone else changed this ${label} after you opened it. Reload to see their changes.`,
  );
}

/**
 * A Contractor or Supplier (CM-406). Not a User. Inactive parties leave the
 * pickers (Resources included) but stay on the Projects they were on.
 */
export class Party {
  private constructor(private props: PartyProps) {}

  static create(input: {
    id: string;
    workspaceId: string;
    kind: PartyKind;
    details: PartyDetailsInput;
    departmentIds: readonly string[];
    projectIds: readonly string[];
    by: string;
    now: Date;
  }): Party {
    return new Party({
      id: input.id,
      workspaceId: input.workspaceId,
      kind: input.kind,
      ...partyDetails(input.kind, input.details),
      isActive: true,
      departmentIds:
        input.kind === "contractor" ? unique(input.departmentIds) : [],
      projectIds: unique(input.projectIds),
      createdAt: input.now,
      updatedAt: input.now,
      createdBy: input.by,
      updatedBy: input.by,
      deletedAt: null,
      deletedBy: null,
    });
  }

  static reconstitute(props: PartyProps): Party {
    return new Party(props);
  }

  get id(): string {
    return this.props.id;
  }
  get workspaceId(): string {
    return this.props.workspaceId;
  }
  get kind(): PartyKind {
    return this.props.kind;
  }
  get details(): PartyDetails {
    const {
      name,
      contactPerson,
      mobile,
      email,
      address,
      gstin,
      pan,
      stateCode,
      contactPerson2,
      mobile2,
    } = this.props;
    return {
      name,
      contactPerson,
      mobile,
      email,
      address,
      gstin,
      pan,
      stateCode,
      contactPerson2,
      mobile2,
    };
  }
  get name(): string {
    return this.props.name;
  }
  get isActive(): boolean {
    return this.props.isActive;
  }
  get departmentIds(): readonly string[] {
    return this.props.departmentIds;
  }
  get projectIds(): readonly string[] {
    return this.props.projectIds;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get updatedBy(): string {
    return this.props.updatedBy;
  }
  get deletedAt(): Date | null {
    return this.props.deletedAt;
  }
  get deletedBy(): string | null {
    return this.props.deletedBy;
  }

  snapshot(): PartySnapshot {
    return {
      ...this.details,
      isActive: this.props.isActive,
      departmentIds: [...this.props.departmentIds],
      projectIds: [...this.props.projectIds],
    };
  }

  private assertLive(): void {
    if (this.props.deletedAt != null) throw partyNotFound(this.props.kind);
  }

  private touch(by: string, now: Date): void {
    this.props = { ...this.props, updatedAt: now, updatedBy: by };
  }

  /** The master form: details, Departments and Projects together. */
  update(
    input: {
      details: PartyDetailsInput;
      departmentIds: readonly string[];
      projectIds: readonly string[];
    },
    by: string,
    now: Date,
  ): void {
    this.assertLive();
    this.props = {
      ...this.props,
      ...partyDetails(this.props.kind, input.details),
      departmentIds:
        this.props.kind === "contractor" ? unique(input.departmentIds) : [],
      projectIds: unique(input.projectIds),
    };
    this.touch(by, now);
  }

  /** False when it already was. */
  setActive(isActive: boolean, by: string, now: Date): boolean {
    this.assertLive();
    if (this.props.isActive === isActive) return false;
    this.props = { ...this.props, isActive };
    this.touch(by, now);
    return true;
  }

  /**
   * Put on a Project from its Resources. An inactive party stays on the
   * Projects it is on but is not added to another one.
   */
  joinProject(projectId: string, by: string, now: Date): void {
    this.assertLive();
    if (this.props.projectIds.includes(projectId)) return;
    if (!this.props.isActive) {
      const { code, label } = PARTY_KIND_INFO[this.props.kind];
      throw new DomainError(
        `${code}_INACTIVE`,
        `${this.props.name} is an inactive ${label}. Make them active in Masters to add them to a Project.`,
        { details: { id: this.props.id } },
      );
    }
    this.props = {
      ...this.props,
      projectIds: [...this.props.projectIds, projectId],
    };
    this.touch(by, now);
  }

  /** Taken off a Project from its Resources. */
  leaveProject(projectId: string, by: string, now: Date): void {
    this.assertLive();
    if (!this.props.projectIds.includes(projectId)) return;
    this.props = {
      ...this.props,
      projectIds: this.props.projectIds.filter((id) => id !== projectId),
    };
    this.touch(by, now);
  }

  delete(by: string, now: Date): void {
    this.assertLive();
    this.props = { ...this.props, deletedAt: now, deletedBy: by };
    this.touch(by, now);
  }
}
