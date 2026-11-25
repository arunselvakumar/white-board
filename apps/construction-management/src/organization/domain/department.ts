import { DomainError, conflict } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";

export const DEPARTMENT_NAME_MAX = 100;

/**
 * The system departments every Company has (ADR CM-0049 §3), the two the
 * Departments menu opens (ADR CM-0046). Same names as `lib/departments-nav.ts`.
 */
export const SYSTEM_DEPARTMENT_NAMES = [
  "Human Resources",
  "Marketing",
] as const;

function cleanName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length === 0)
    throw new DomainError(
      "DEPARTMENT_NAME_REQUIRED",
      "Enter the Department name.",
    );
  if (name.length > DEPARTMENT_NAME_MAX)
    throw new DomainError(
      "DEPARTMENT_NAME_TOO_LONG",
      `Department name must be at most ${String(DEPARTMENT_NAME_MAX)} characters.`,
    );
  return name;
}

export type DepartmentProps = {
  id: string;
  workspaceId: string;
  name: string;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  deletedAt: Date | null;
  deletedBy: string | null;
};

/**
 * A department of the Company (Manage Departments, ADR CM-0049): a name,
 * linked to nothing else for now. A system department (Human Resources,
 * Marketing) keeps its name and is never deleted; a Company-made one can
 * be renamed and deleted.
 */
export class Department {
  private constructor(private props: DepartmentProps) {}

  static create(input: {
    id: string;
    workspaceId: string;
    name: string;
    isSystem?: boolean;
    by: string;
    now: Date;
  }): Department {
    return new Department({
      id: input.id,
      workspaceId: input.workspaceId,
      name: cleanName(input.name),
      isSystem: input.isSystem ?? false,
      createdAt: input.now,
      updatedAt: input.now,
      createdBy: input.by,
      updatedBy: input.by,
      deletedAt: null,
      deletedBy: null,
    });
  }

  /** Human Resources and Marketing, for a new Company. */
  static systemSet(input: {
    workspaceId: string;
    by: string;
    now: Date;
  }): Department[] {
    return SYSTEM_DEPARTMENT_NAMES.map((name) =>
      Department.create({
        id: newId(input.now.getTime()),
        workspaceId: input.workspaceId,
        name,
        isSystem: true,
        by: input.by,
        now: input.now,
      }),
    );
  }

  static reconstitute(props: DepartmentProps): Department {
    return new Department(props);
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
  get isSystem(): boolean {
    return this.props.isSystem;
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

  /** 400 `DEPARTMENT_SYSTEM_LOCKED` for a system department. */
  rename(input: { name: string; by: string; now: Date }): void {
    if (this.props.isSystem)
      throw new DomainError(
        "DEPARTMENT_SYSTEM_LOCKED",
        "A system Department keeps its name.",
      );
    this.props = {
      ...this.props,
      name: cleanName(input.name),
      updatedAt: input.now,
      updatedBy: input.by,
    };
  }

  /** Soft delete. 409 `DEPARTMENT_IS_SYSTEM` for a system department. */
  delete(by: string, now: Date): void {
    if (this.props.isSystem)
      throw conflict(
        "DEPARTMENT_IS_SYSTEM",
        "System Departments cannot be deleted.",
      );
    this.props = {
      ...this.props,
      deletedAt: now,
      deletedBy: by,
      updatedAt: now,
      updatedBy: by,
    };
  }
}
