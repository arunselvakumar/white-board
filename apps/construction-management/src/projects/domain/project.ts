import {
  assertCalendarDate,
  daysBetween,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { DomainError, notFound } from "@/src/shared-kernel/domain-error";

import {
  NO_CONTRACT_DETAILS,
  contractDetails,
  customFields,
  type ProjectContractDetails,
  type ProjectContractInput,
  type ProjectCustomField,
} from "./project-contract";
import { PROJECT_BUDGET_MAX } from "./project-contract-rules";
import {
  isProjectType,
  projectStructure,
  type ProjectStructure,
  type ProjectType,
} from "./project-type";

export const PROJECT_NAME_MAX = 120;
export const PROJECT_ADDRESS_MAX = 500;

/**
 * Project statuses in the order the Projects home lists them and shows its
 * filter chips: work in hand first, finished work last (`modules/03`).
 */
export const PROJECT_STATUSES = [
  "ongoing",
  "not_started",
  "on_hold",
  "completed",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export function isProjectStatus(value: string): value is ProjectStatus {
  return (PROJECT_STATUSES as readonly string[]).includes(value);
}

/**
 * What a Team Member types on the Project form. The contract details and
 * custom fields (CM-413) are optional; left out of an edit, they keep what
 * is stored. So do the Project Type, Budget and `useLogoInReports` (CM-401),
 * though a new Project must have a type.
 */
export type ProjectDetailsInput = {
  name: string;
  status?: string | null;
  address?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  customFields?: readonly { label: string; value: string }[];
  projectType?: string | null;
  /** Paise. */
  budgetValue?: number | null;
  useLogoInReports?: boolean;
} & ProjectContractInput;

/**
 * What M4 adds to a Project (CM-401). `projectType` is null only on
 * Projects from before M4; `budgetValue` is paise and Financial; `logoKey`
 * is the storage key of the logo, set through its own route.
 */
export type ProjectProfile = {
  projectType: ProjectType | null;
  budgetValue: number | null;
  useLogoInReports: boolean;
  logoKey: string | null;
};

export type ProjectDetails = {
  name: string;
  status: ProjectStatus;
  address: string | null;
  startDate: CalendarDate | null;
  endDate: CalendarDate | null;
};

function cleanName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length === 0)
    throw new DomainError("PROJECT_NAME_REQUIRED", "Enter the Project name.");
  if (name.length > PROJECT_NAME_MAX)
    throw new DomainError(
      "PROJECT_NAME_TOO_LONG",
      `Project name must be at most ${String(PROJECT_NAME_MAX)} characters.`,
    );
  return name;
}

function cleanAddress(raw: string | null | undefined): string | null {
  const address = raw?.trim() ?? "";
  if (address.length === 0) return null;
  if (address.length > PROJECT_ADDRESS_MAX)
    throw new DomainError(
      "PROJECT_ADDRESS_TOO_LONG",
      `Project address must be at most ${String(PROJECT_ADDRESS_MAX)} characters.`,
    );
  return address;
}

function cleanStatus(raw: string | null | undefined): ProjectStatus {
  if (raw == null || raw === "") return "ongoing";
  if (!isProjectStatus(raw))
    throw new DomainError(
      "PROJECT_STATUS_INVALID",
      "Choose Ongoing, Not started, On hold or Completed.",
    );
  return raw;
}

/** Required: a new Project has one, and an edit may not take it away. */
function requiredProjectType(raw: string | null | undefined): ProjectType {
  if (raw == null || raw.trim() === "")
    throw new DomainError(
      "PROJECT_TYPE_REQUIRED",
      "Choose the Project Type: it decides whether the Project has Wings or Locations.",
    );
  if (!isProjectType(raw))
    throw new DomainError(
      "PROJECT_TYPE_INVALID",
      `"${raw}" is not a Project Type.`,
    );
  return raw;
}

/** Optional paise, 0 to ₹1,000 crore, like the Order Value. */
function cleanBudget(raw: number | null | undefined): number | null {
  if (raw == null) return null;
  if (!Number.isSafeInteger(raw) || raw < 0 || raw > PROJECT_BUDGET_MAX)
    throw new DomainError(
      "PROJECT_BUDGET_INVALID",
      "Enter the budget in rupees, up to ₹1,000 crore.",
    );
  return raw;
}

/**
 * The Project Type, Budget and `useLogoInReports` as saved: a field left
 * out keeps `current`; `null` clears the Budget. The logo is not here: it
 * changes through its own route.
 */
function projectProfile(
  input: ProjectDetailsInput,
  current: ProjectProfile,
): ProjectProfile {
  return {
    projectType:
      input.projectType === undefined
        ? current.projectType
        : requiredProjectType(input.projectType),
    budgetValue:
      input.budgetValue === undefined
        ? current.budgetValue
        : cleanBudget(input.budgetValue),
    useLogoInReports: input.useLogoInReports ?? current.useLogoInReports,
    logoKey: current.logoKey,
  };
}

function cleanDate(raw: string | null | undefined): CalendarDate | null {
  const value = raw?.trim() ?? "";
  if (value === "") return null;
  return assertCalendarDate(value, "PROJECT_DATE_INVALID");
}

/**
 * Validates the Project form (CM-204): name required (≤ 120, spaces tidied),
 * status defaults to Ongoing, address ≤ 500, and the end date — "Expected
 * Completion" — is not before the start date.
 */
export function projectDetails(input: ProjectDetailsInput): ProjectDetails {
  const startDate = cleanDate(input.startDate);
  const endDate = cleanDate(input.endDate);
  if (
    startDate != null &&
    endDate != null &&
    daysBetween(startDate, endDate) < 0
  )
    throw new DomainError(
      "PROJECT_DATES_INVALID",
      "The end date cannot be before the start date.",
    );
  return {
    name: cleanName(input.name),
    status: cleanStatus(input.status),
    address: cleanAddress(input.address),
    startDate,
    endDate,
  };
}

export type ProjectProps = ProjectDetails &
  ProjectContractDetails &
  ProjectProfile & {
    customFields: ProjectCustomField[];
    id: string;
    workspaceId: string;
    createdAt: Date;
    updatedAt: Date;
    createdBy: string;
    updatedBy: string;
    deletedAt: Date | null;
  };

/**
 * A construction job (`modules/03`). M2 shipped the minimal Project —
 * name, status, address and dates — because labour and attendance are
 * scoped to one (CM-204); CM-413 adds the contract details and custom
 * fields; CM-401 the Project Type, Budget and logo.
 */
export class Project {
  private constructor(private props: ProjectProps) {}

  static create(input: {
    id: string;
    workspaceId: string;
    details: ProjectDetailsInput;
    by: string;
    now: Date;
  }): Project {
    return new Project({
      ...projectDetails(input.details),
      ...contractDetails(input.details, NO_CONTRACT_DETAILS),
      ...projectProfile(
        // Left out on create is "none chosen", not "keep".
        {
          ...input.details,
          projectType: input.details.projectType ?? null,
        },
        {
          projectType: null,
          budgetValue: null,
          useLogoInReports: false,
          logoKey: null,
        },
      ),
      customFields: customFields(input.details.customFields ?? []),
      id: input.id,
      workspaceId: input.workspaceId,
      createdAt: input.now,
      updatedAt: input.now,
      createdBy: input.by,
      updatedBy: input.by,
      deletedAt: null,
    });
  }

  static reconstitute(props: ProjectProps): Project {
    return new Project(props);
  }

  get id(): string {
    return this.props.id;
  }
  get workspaceId(): string {
    return this.props.workspaceId;
  }
  get name(): string {
    return this.props.name;
  }
  get status(): ProjectStatus {
    return this.props.status;
  }
  get address(): string | null {
    return this.props.address;
  }
  get startDate(): CalendarDate | null {
    return this.props.startDate;
  }
  get endDate(): CalendarDate | null {
    return this.props.endDate;
  }
  /** Null only on a Project from before M4 ("Not set"). */
  get projectType(): ProjectType | null {
    return this.props.projectType;
  }
  /** Wings or Locations, as the Project Type suggests (CM-0013 §1). */
  get structure(): ProjectStructure {
    return projectStructure(this.props.projectType);
  }
  /** Paise; the routes hide it without the Financial flag. */
  get budgetValue(): number | null {
    return this.props.budgetValue;
  }
  /** Report headers print the Project logo instead of the Company's (M9). */
  get useLogoInReports(): boolean {
    return this.props.useLogoInReports;
  }
  /** Storage key of the logo, or null. */
  get logoKey(): string | null {
    return this.props.logoKey;
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

  get details(): ProjectDetails {
    return {
      name: this.props.name,
      status: this.props.status,
      address: this.props.address,
      startDate: this.props.startDate,
      endDate: this.props.endDate,
    };
  }

  get contract(): ProjectContractDetails {
    return {
      clientName: this.props.clientName,
      clientPhone: this.props.clientPhone,
      tenderRef: this.props.tenderRef,
      quotationNo: this.props.quotationNo,
      quotationDate: this.props.quotationDate,
      loaNo: this.props.loaNo,
      loaDate: this.props.loaDate,
      clientOrderNo: this.props.clientOrderNo,
      clientOrderDate: this.props.clientOrderDate,
      agreementNo: this.props.agreementNo,
      agreementDate: this.props.agreementDate,
      orderValue: this.props.orderValue,
    };
  }

  /** In the order they were entered. */
  get customFields(): readonly ProjectCustomField[] {
    return this.props.customFields;
  }

  get profile(): ProjectProfile {
    return {
      projectType: this.props.projectType,
      budgetValue: this.props.budgetValue,
      useLogoInReports: this.props.useLogoInReports,
      logoKey: this.props.logoKey,
    };
  }

  /**
   * Edit Project: name, status, address and dates at once (the legacy app
   * allows any status change); a contract detail, the custom-field list,
   * the Project Type, Budget or `useLogoInReports` left out keeps what is
   * stored.
   */
  update(details: ProjectDetailsInput, by: string, now: Date): void {
    this.props = {
      ...this.props,
      ...projectDetails(details),
      ...contractDetails(details, this.contract),
      ...projectProfile(details, this.profile),
      customFields:
        details.customFields === undefined
          ? this.props.customFields
          : customFields(details.customFields),
      updatedAt: now,
      updatedBy: by,
    };
  }

  /**
   * Sets or replaces the logo with the stored file at `key`; returns the
   * key it replaced, whose file the caller marks deleted.
   */
  setLogo(key: string, by: string, now: Date): string | null {
    const replaced = this.props.logoKey;
    this.props = { ...this.props, logoKey: key, updatedAt: now, updatedBy: by };
    return replaced;
  }

  /** Removes the logo; returns the key it had (null: nothing changed). */
  removeLogo(by: string, now: Date): string | null {
    const removed = this.props.logoKey;
    if (removed == null) return null;
    this.props = {
      ...this.props,
      logoKey: null,
      updatedAt: now,
      updatedBy: by,
    };
    return removed;
  }

  delete(by: string, now: Date): void {
    if (this.props.deletedAt != null)
      throw notFound("PROJECT_NOT_FOUND", "This Project was deleted.");
    this.props = {
      ...this.props,
      deletedAt: now,
      updatedAt: now,
      updatedBy: by,
    };
  }
}

const byName = new Intl.Collator("en", { sensitivity: "base", numeric: true });

/** Projects home order: by status (Ongoing first), then by name. */
export function compareProjects(
  a: { status: ProjectStatus; name: string },
  b: { status: ProjectStatus; name: string },
): number {
  const byStatus =
    PROJECT_STATUSES.indexOf(a.status) - PROJECT_STATUSES.indexOf(b.status);
  return byStatus !== 0 ? byStatus : byName.compare(a.name, b.name);
}
