import { DomainError, conflict } from "@/src/shared-kernel/domain-error";

import { cleanMasterName, masterNotFound } from "./master-kind";

export type MaterialCategoryProps = {
  id: string;
  workspaceId: string;
  name: string;
  /** Null for a top-level category. */
  parentId: string | null;
  isSeed: boolean;
  disabledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  deletedAt: Date | null;
  deletedBy: string | null;
};

export type MaterialCategorySnapshot = {
  name: string;
  parentId: string | null;
  isSeed: boolean;
  disabled: boolean;
};

/** What the hierarchy check needs to know about a chosen parent. */
export type ParentFacts = {
  id: string;
  name: string;
  parentId: string | null;
  disabled: boolean;
};

export function seedIsReadOnly(label: string): DomainError {
  return conflict(
    "SEED_IS_READ_ONLY",
    `This ${label} came with the app, so it cannot be changed or deleted. Disable it instead.`,
  );
}

/**
 * The one-level hierarchy of Material Categories (`modules/02`
 * recommendation 8): a parent must be a live top-level category, never the
 * category itself; a category with sub-categories cannot get a parent.
 * `parent` is null when the id is not a live category of the Company.
 */
export function assertParent(input: {
  categoryId: string | null;
  parentId: string;
  parent: ParentFacts | null;
  /** The category already had this parent: kept even if disabled since. */
  kept: boolean;
  childCount: number;
}): void {
  const { parent } = input;
  if (input.parentId === input.categoryId)
    throw new DomainError(
      "MATERIAL_CATEGORY_PARENT_INVALID",
      "A Material Category cannot be its own parent.",
    );
  if (parent == null)
    throw new DomainError(
      "MATERIAL_CATEGORY_NOT_FOUND",
      "Choose the parent category from the list. It was not found.",
      { details: { parentId: input.parentId } },
    );
  if (parent.parentId != null)
    throw new DomainError(
      "MATERIAL_CATEGORY_PARENT_INVALID",
      `${parent.name} is itself a sub-category. Choose a top-level category as the parent.`,
    );
  if (parent.disabled && !input.kept)
    throw new DomainError(
      "MATERIAL_CATEGORY_DISABLED",
      `${parent.name} is disabled, so it cannot be chosen.`,
    );
  if (input.childCount > 0)
    throw conflict(
      "MATERIAL_CATEGORY_HAS_CHILDREN",
      "This Material Category has sub-categories, so it cannot be put under another one. Move its sub-categories first.",
    );
}

/** A group of Materials (Civil Work Materials …), one level of parent (CM-501). */
export class MaterialCategory {
  private constructor(private props: MaterialCategoryProps) {}

  static create(input: {
    id: string;
    workspaceId: string;
    name: string;
    parentId: string | null;
    isSeed?: boolean;
    by: string;
    now: Date;
  }): MaterialCategory {
    return new MaterialCategory({
      id: input.id,
      workspaceId: input.workspaceId,
      name: cleanMasterName("material_category", input.name),
      parentId: input.parentId,
      isSeed: input.isSeed ?? false,
      disabledAt: null,
      createdAt: input.now,
      updatedAt: input.now,
      createdBy: input.by,
      updatedBy: input.by,
      deletedAt: null,
      deletedBy: null,
    });
  }

  static reconstitute(props: MaterialCategoryProps): MaterialCategory {
    return new MaterialCategory(props);
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
  get parentId(): string | null {
    return this.props.parentId;
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
  get updatedBy(): string {
    return this.props.updatedBy;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get deletedAt(): Date | null {
    return this.props.deletedAt;
  }
  get deletedBy(): string | null {
    return this.props.deletedBy;
  }

  snapshot(): MaterialCategorySnapshot {
    return {
      name: this.props.name,
      parentId: this.props.parentId,
      isSeed: this.props.isSeed,
      disabled: this.disabled,
    };
  }

  private assertLive(): void {
    if (this.props.deletedAt != null) throw masterNotFound("material_category");
  }

  private assertNotSeed(): void {
    if (this.props.isSeed) throw seedIsReadOnly("Material Category");
  }

  /** Name and parent; the caller checked the parent with `assertParent`. */
  update(
    input: { name: string; parentId: string | null },
    by: string,
    now: Date,
  ): void {
    this.assertLive();
    this.assertNotSeed();
    this.props = {
      ...this.props,
      name: cleanMasterName("material_category", input.name),
      parentId: input.parentId,
      updatedAt: now,
      updatedBy: by,
    };
  }

  setDisabled(disabled: boolean, by: string, now: Date): boolean {
    this.assertLive();
    if (this.disabled === disabled) return false;
    this.props = {
      ...this.props,
      disabledAt: disabled ? now : null,
      updatedAt: now,
      updatedBy: by,
    };
    return true;
  }

  delete(by: string, now: Date): void {
    this.assertLive();
    this.assertNotSeed();
    this.props = {
      ...this.props,
      deletedAt: now,
      deletedBy: by,
      updatedAt: now,
      updatedBy: by,
    };
  }
}
