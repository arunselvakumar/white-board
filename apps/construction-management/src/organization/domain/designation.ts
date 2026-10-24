import { DomainError } from "@/src/shared-kernel/domain-error";

export const DESIGNATION_NAME_MAX = 80;

function cleanName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length === 0)
    throw new DomainError(
      "DESIGNATION_NAME_REQUIRED",
      "Enter the Designation name.",
    );
  if (name.length > DESIGNATION_NAME_MAX)
    throw new DomainError(
      "DESIGNATION_NAME_TOO_LONG",
      `Designation name must be at most ${String(DESIGNATION_NAME_MAX)} characters.`,
    );
  return name;
}

export type DesignationProps = {
  id: string;
  workspaceId: string;
  name: string;
  /** Copied from the seed set when the Company was created. */
  isSeed: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  deletedAt: Date | null;
};

/**
 * A job title in a Company (`modules/01` Designations, CM-106). It carries
 * no access: that is the Team Member's Role (ADR CM-0030). Every Company
 * holds its own copy of the seed set and may edit it.
 */
export class Designation {
  private constructor(private props: DesignationProps) {}

  static create(input: {
    id: string;
    workspaceId: string;
    name: string;
    isSeed?: boolean;
    by: string;
    now: Date;
  }): Designation {
    return new Designation({
      id: input.id,
      workspaceId: input.workspaceId,
      name: cleanName(input.name),
      isSeed: input.isSeed ?? false,
      createdAt: input.now,
      updatedAt: input.now,
      createdBy: input.by,
      updatedBy: input.by,
      deletedAt: null,
    });
  }

  static reconstitute(props: DesignationProps): Designation {
    return new Designation(props);
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
  get isSeed(): boolean {
    return this.props.isSeed;
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

  rename(name: string, by: string, now: Date): void {
    this.props = {
      ...this.props,
      name: cleanName(name),
      updatedAt: now,
      updatedBy: by,
    };
  }

  /** A Company-made copy (`Designation/Duplicate`). */
  duplicate(input: {
    id: string;
    name?: string;
    by: string;
    now: Date;
  }): Designation {
    return Designation.create({
      id: input.id,
      workspaceId: this.props.workspaceId,
      name: input.name ?? `${this.props.name} (copy)`,
      by: input.by,
      now: input.now,
    });
  }

  delete(by: string, now: Date): void {
    if (this.props.deletedAt != null)
      throw new DomainError(
        "DESIGNATION_NOT_FOUND",
        "This Designation was deleted.",
        {
          kind: "not_found",
        },
      );
    this.props = {
      ...this.props,
      deletedAt: now,
      updatedAt: now,
      updatedBy: by,
    };
  }
}
