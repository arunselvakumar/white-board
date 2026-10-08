import {
  assertCalendarDate,
  daysBetween,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { DomainError, notFound } from "@/src/shared-kernel/domain-error";

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

/** What a Team Member types on the Project form. */
export type ProjectDetailsInput = {
  name: string;
  status?: string | null;
  address?: string | null;
  startDate?: string | null;
  endDate?: string | null;
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

export type ProjectProps = ProjectDetails & {
  id: string;
  workspaceId: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  deletedAt: Date | null;
};

/**
 * A construction job (`modules/03`). M2 ships this minimal Project —
 * name, status, address and dates — because labour and attendance are
 * scoped to one (CM-204); M4 grows it.
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

  /** Edit Project: every field at once (the legacy app allows any status change). */
  update(details: ProjectDetailsInput, by: string, now: Date): void {
    this.props = {
      ...this.props,
      ...projectDetails(details),
      updatedAt: now,
      updatedBy: by,
    };
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
