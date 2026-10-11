import { DomainError } from "@/src/shared-kernel/domain-error";

import { seedIsReadOnly } from "./material-category";
import { masterNotFound } from "./master-kind";

/** A Work Type's name: required, at most 120 characters (the migration's CHECK). */
export const WORK_TYPE_NAME_MAX = 120;

/** Materials one Work Type may list. */
export const WORK_TYPE_MATERIALS_MAX = 200;

export type WorkTypeProps = {
  id: string;
  workspaceId: string;
  name: string;
  departmentId: string;
  /** Assigned Materials, offered first on a worksheet (CM-0016 §5). */
  materialIds: string[];
  /** Copied from the seed set when the Company was created (RCC). */
  isSeed: boolean;
  disabledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  deletedAt: Date | null;
  deletedBy: string | null;
};

/** What the audit log keeps of a Work Type. */
export type WorkTypeSnapshot = {
  name: string;
  departmentId: string;
  materialIds: string[];
  isSeed: boolean;
  disabled: boolean;
};

export type WorkTypeInput = {
  name: string;
  departmentId: string;
  materialIds: readonly string[];
};

/** Trims and collapses inner spaces; required and at most 120 characters. */
export function cleanWorkTypeName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length === 0)
    throw new DomainError(
      "WORK_TYPE_NAME_REQUIRED",
      "Enter the Work Type name.",
      {
        details: { field: "name" },
      },
    );
  if (name.length > WORK_TYPE_NAME_MAX)
    throw new DomainError(
      "WORK_TYPE_NAME_TOO_LONG",
      `Work Type name must be at most ${String(WORK_TYPE_NAME_MAX)} characters.`,
      { details: { field: "name" } },
    );
  return name;
}

/** Each Material once, in the order chosen; at most 200. */
export function cleanMaterialIds(ids: readonly string[]): string[] {
  const unique = [...new Set(ids)];
  if (unique.length > WORK_TYPE_MATERIALS_MAX)
    throw new DomainError(
      "WORK_TYPE_MATERIALS_TOO_MANY",
      `Assign at most ${String(WORK_TYPE_MATERIALS_MAX)} Materials to a Work Type.`,
      { details: { field: "materialIds" } },
    );
  return unique;
}

/**
 * A Work Type (`modules/02`, ADR CM-0016 §1): what a crew does within a
 * Department, with the Materials a worksheet offers first. The seed (RCC)
 * keeps its name and Department and is never deleted, but can be disabled
 * and given Materials. Disabled Work Types stay on old worksheets and leave
 * the pickers.
 */
export class WorkType {
  private constructor(private props: WorkTypeProps) {}

  static create(input: {
    id: string;
    workspaceId: string;
    details: WorkTypeInput;
    by: string;
    now: Date;
  }): WorkType {
    return new WorkType({
      id: input.id,
      workspaceId: input.workspaceId,
      name: cleanWorkTypeName(input.details.name),
      departmentId: input.details.departmentId,
      materialIds: cleanMaterialIds(input.details.materialIds),
      isSeed: false,
      disabledAt: null,
      createdAt: input.now,
      updatedAt: input.now,
      createdBy: input.by,
      updatedBy: input.by,
      deletedAt: null,
      deletedBy: null,
    });
  }

  static reconstitute(props: WorkTypeProps): WorkType {
    return new WorkType({ ...props, materialIds: [...props.materialIds] });
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
  get departmentId(): string {
    return this.props.departmentId;
  }
  get materialIds(): readonly string[] {
    return this.props.materialIds;
  }
  get isSeed(): boolean {
    return this.props.isSeed;
  }
  get disabled(): boolean {
    return this.props.disabledAt != null;
  }
  get disabledAt(): Date | null {
    return this.props.disabledAt;
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

  snapshot(): WorkTypeSnapshot {
    return {
      name: this.props.name,
      departmentId: this.props.departmentId,
      materialIds: [...this.props.materialIds],
      isSeed: this.props.isSeed,
      disabled: this.disabled,
    };
  }

  private assertLive(): void {
    if (this.props.deletedAt != null) throw masterNotFound("work_type");
  }

  private touch(by: string, now: Date): void {
    this.props = { ...this.props, updatedAt: now, updatedBy: by };
  }

  /**
   * Changes the name, Department and Materials. A seed keeps its name and
   * Department (409 `SEED_IS_READ_ONLY` when either changes); its Materials
   * may change.
   */
  update(details: WorkTypeInput, by: string, now: Date): void {
    this.assertLive();
    const name = cleanWorkTypeName(details.name);
    const materialIds = cleanMaterialIds(details.materialIds);
    if (
      this.props.isSeed &&
      (name !== this.props.name ||
        details.departmentId !== this.props.departmentId)
    )
      throw seedIsReadOnly("Work Type");
    this.props = {
      ...this.props,
      name,
      departmentId: details.departmentId,
      materialIds,
    };
    this.touch(by, now);
  }

  /** Disables or enables; false when it already was. Seeds too. */
  setDisabled(disabled: boolean, by: string, now: Date): boolean {
    this.assertLive();
    if (this.disabled === disabled) return false;
    this.props = { ...this.props, disabledAt: disabled ? now : null };
    this.touch(by, now);
    return true;
  }

  /** A tombstone. The seed is only ever disabled. */
  delete(by: string, now: Date): void {
    this.assertLive();
    if (this.props.isSeed) throw seedIsReadOnly("Work Type");
    this.props = { ...this.props, deletedAt: now, deletedBy: by };
    this.touch(by, now);
  }
}
