import { PermissionSet } from "@/src/shared-kernel/access";
import { DomainError } from "@/src/shared-kernel/domain-error";

export const ROLE_NAME_MAX = 100;
export const ROLE_DESCRIPTION_MAX = 300;

function cleanName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length === 0)
    throw new DomainError("ROLE_NAME_REQUIRED", "Enter the Role name.");
  if (name.length > ROLE_NAME_MAX)
    throw new DomainError(
      "ROLE_NAME_TOO_LONG",
      `Role name must be at most ${String(ROLE_NAME_MAX)} characters.`,
    );
  return name;
}

function cleanDescription(raw: string | null | undefined): string | null {
  const description = raw?.trim() ?? "";
  if (description.length === 0) return null;
  if (description.length > ROLE_DESCRIPTION_MAX)
    throw new DomainError(
      "ROLE_DESCRIPTION_TOO_LONG",
      `Description must be at most ${String(ROLE_DESCRIPTION_MAX)} characters.`,
    );
  return description;
}

/**
 * The name Duplicate gives a copy: "<name> (copy)", then "(copy 2)", … —
 * the first not in `taken` (lower-cased live names). The base is cut so the
 * copy still fits the name limit.
 */
export function copyName(name: string, taken: ReadonlySet<string>): string {
  for (let index = 1; ; index += 1) {
    const suffix = index === 1 ? " (copy)" : ` (copy ${String(index)})`;
    const candidate = `${name.slice(0, ROLE_NAME_MAX - suffix.length).trimEnd()}${suffix}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

export type RoleProps = {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  /** Copied from `seeds/roles.json` when the Company was created. */
  isSeed: boolean;
  permissions: PermissionSet;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  deletedAt: Date | null;
};

/**
 * A named Permission Matrix given to Team Members (ADR CM-0029). Every
 * Team Member but the Owner has one Role, and their access is read through
 * it on every request, so editing a Role changes access for everyone on
 * it. Seeded Roles can be renamed, edited and deleted like any other.
 */
export class Role {
  private constructor(private props: RoleProps) {}

  static create(input: {
    id: string;
    workspaceId: string;
    name: string;
    description?: string | null;
    permissions: PermissionSet;
    isSeed?: boolean;
    by: string;
    now: Date;
  }): Role {
    return new Role({
      id: input.id,
      workspaceId: input.workspaceId,
      name: cleanName(input.name),
      description: cleanDescription(input.description),
      isSeed: input.isSeed ?? false,
      permissions: input.permissions,
      createdAt: input.now,
      updatedAt: input.now,
      createdBy: input.by,
      updatedBy: input.by,
      deletedAt: null,
    });
  }

  static reconstitute(props: RoleProps): Role {
    return new Role(props);
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
  get description(): string | null {
    return this.props.description;
  }
  get isSeed(): boolean {
    return this.props.isSeed;
  }
  get permissions(): PermissionSet {
    return this.props.permissions;
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

  /** Replaces the name, description and the whole matrix. */
  update(input: {
    name: string;
    description?: string | null;
    permissions: PermissionSet;
    by: string;
    now: Date;
  }): void {
    this.props = {
      ...this.props,
      name: cleanName(input.name),
      description: cleanDescription(input.description),
      permissions: input.permissions,
      updatedAt: input.now,
      updatedBy: input.by,
    };
  }

  /** A Company-made copy with the same matrix (`Role/Duplicate`). */
  duplicate(input: { id: string; name: string; by: string; now: Date }): Role {
    return Role.create({
      id: input.id,
      workspaceId: this.props.workspaceId,
      name: input.name,
      description: this.props.description,
      permissions: this.props.permissions,
      by: input.by,
      now: input.now,
    });
  }

  /** Soft delete; the caller has checked no Team Member is on it. */
  delete(by: string, now: Date): void {
    if (this.props.deletedAt != null)
      throw new DomainError("ROLE_NOT_FOUND", "This Role was deleted.", {
        kind: "not_found",
      });
    this.props = {
      ...this.props,
      deletedAt: now,
      updatedAt: now,
      updatedBy: by,
    };
  }
}

/** The cells two matrices differ in: added or removed (ADR CM-0029). */
export function changedCells(
  before: PermissionSet,
  after: PermissionSet,
): PermissionSet {
  const mine = before.toMasks();
  const theirs = after.toMasks();
  const masks: Record<string, number> = {};
  for (const menu of new Set([...Object.keys(mine), ...Object.keys(theirs)]))
    masks[menu] = (mine[menu] ?? 0) ^ (theirs[menu] ?? 0);
  return PermissionSet.fromMasks(masks);
}
