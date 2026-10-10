import { DomainError } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";

import { LookupEntry } from "../domain/lookup-entry";
import {
  Material,
  type MaterialDetailsInput,
  type MaterialDiscount,
  type MaterialItemType,
  type MaterialRateInput,
} from "../domain/material";
import {
  MaterialCategory,
  assertParent,
  seedIsReadOnly,
} from "../domain/material-category";
import {
  masterChanged,
  masterInUse,
  masterNotFound,
  type MaterialMasterKind,
} from "../domain/master-kind";
import { TermsCondition } from "../domain/terms-condition";
import type {
  MasterListParams,
  MasterPage,
  MaterialCategoryListParams,
  MaterialCategoryRow,
  MaterialCategoryStore,
  MaterialListParams,
  MaterialRow,
  MaterialStore,
  MaterialUsage,
  MeasurementUnitStore,
  PickedMaster,
  TermsConditionStore,
} from "./material-ports";

type Clock = () => Date;
type Target = { workspaceId: string; id: string; by: string };

function assertFresh(
  kind: MaterialMasterKind,
  loaded: Date,
  expected: Date,
): void {
  if (loaded.getTime() !== expected.getTime()) throw masterChanged(kind);
}

function mapPage<T, R>(page: MasterPage<T>, map: (item: T) => R) {
  return { items: page.items.map(map), total: page.total, hasMore: page.hasMore };
}

// ---------------------------------------------------------------------------
// Measurement Units

export type MeasurementUnitReadModel = {
  id: string;
  name: string;
  isSeed: boolean;
  disabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function unitModel(
  unit: LookupEntry<"measurement_unit">,
): MeasurementUnitReadModel {
  return {
    id: unit.id,
    name: unit.name,
    isSeed: unit.isSeed,
    disabled: unit.disabled,
    createdAt: unit.createdAt,
    updatedAt: unit.updatedAt,
  };
}

/**
 * Measurement Units (CM-501): name-only, 41 seed rows per Company that
 * can be disabled, not renamed or deleted; a unit a Material is counted in
 * cannot be deleted. Access is checked by the caller.
 */
export class MeasurementUnitHandlers {
  constructor(
    private readonly store: MeasurementUnitStore,
    private readonly clock: Clock = () => new Date(),
  ) {}

  private async load(workspaceId: string, id: string) {
    const found = await this.store.find(workspaceId, id);
    if (found == null) throw masterNotFound("measurement_unit");
    return found;
  }

  async list(params: MasterListParams) {
    return mapPage(await this.store.list(params), unitModel);
  }

  async get(workspaceId: string, id: string) {
    return unitModel(await this.load(workspaceId, id));
  }

  async create(input: { workspaceId: string; name: string; by: string }) {
    const now = this.clock();
    const unit = LookupEntry.create({
      id: newId(now.getTime()),
      kind: "measurement_unit",
      workspaceId: input.workspaceId,
      name: input.name,
      by: input.by,
      now,
    });
    await this.store.insert(unit, {
      action: "measurement_unit.created",
      before: null,
      by: input.by,
      now,
    });
    return unitModel(unit);
  }

  async rename(input: Target & { name: string; expectedUpdatedAt: Date }) {
    const unit = await this.load(input.workspaceId, input.id);
    assertFresh("measurement_unit", unit.updatedAt, input.expectedUpdatedAt);
    const before = unit.snapshot();
    const now = this.clock();
    unit.rename(input.name, input.by, now);
    await this.store.update(unit, input.expectedUpdatedAt, {
      action: "measurement_unit.updated",
      before,
      by: input.by,
      now,
    });
    return unitModel(unit);
  }

  async setDisabled(input: Target & { disabled: boolean }) {
    const unit = await this.load(input.workspaceId, input.id);
    const loadedAt = unit.updatedAt;
    const before = unit.snapshot();
    const now = this.clock();
    const changed = input.disabled
      ? unit.disable(input.by, now)
      : unit.enable(input.by, now);
    if (changed)
      await this.store.update(unit, loadedAt, {
        action: `measurement_unit.${input.disabled ? "disabled" : "enabled"}`,
        before,
        by: input.by,
        now,
      });
    return unitModel(unit);
  }

  /** 409 `SEED_IS_READ_ONLY` for a seed unit, `MEASUREMENT_UNIT_IN_USE` while a Material uses it. */
  async delete(input: Target): Promise<void> {
    const unit = await this.load(input.workspaceId, input.id);
    const loadedAt = unit.updatedAt;
    const before = unit.snapshot();
    const now = this.clock();
    unit.delete(input.by, now);
    if (await this.store.inUse(input.workspaceId, input.id))
      throw masterInUse("measurement_unit");
    await this.store.update(unit, loadedAt, {
      action: "measurement_unit.deleted",
      before,
      by: input.by,
      now,
    });
  }
}

// ---------------------------------------------------------------------------
// Material Categories

export type MaterialCategoryReadModel = {
  id: string;
  name: string;
  parentId: string | null;
  parentName: string | null;
  childCount: number;
  isSeed: boolean;
  disabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function categoryModel(row: MaterialCategoryRow): MaterialCategoryReadModel {
  const { category } = row;
  return {
    id: category.id,
    name: category.name,
    parentId: category.parentId,
    parentName: row.parentName,
    childCount: row.childCount,
    isSeed: category.isSeed,
    disabled: category.disabled,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  };
}

/**
 * Material Categories (CM-501) with one level of parent. Seed rows can be
 * disabled, not changed or deleted; a category Materials or sub-categories
 * use cannot be deleted.
 */
export class MaterialCategoryHandlers {
  constructor(
    private readonly store: MaterialCategoryStore,
    private readonly clock: Clock = () => new Date(),
  ) {}

  private async load(workspaceId: string, id: string) {
    const found = await this.store.find(workspaceId, id);
    if (found == null) throw masterNotFound("material_category");
    return found;
  }

  private async checkParent(input: {
    workspaceId: string;
    categoryId: string | null;
    parentId: string | null;
    keptParentId: string | null;
    childCount: number;
  }): Promise<void> {
    if (input.parentId == null) return;
    const found = await this.store.find(input.workspaceId, input.parentId);
    assertParent({
      categoryId: input.categoryId,
      parentId: input.parentId,
      parent:
        found == null
          ? null
          : {
              id: found.category.id,
              name: found.category.name,
              parentId: found.category.parentId,
              disabled: found.category.disabled,
            },
      kept: input.parentId === input.keptParentId,
      childCount: input.childCount,
    });
  }

  async list(params: MaterialCategoryListParams) {
    return mapPage(await this.store.list(params), categoryModel);
  }

  async get(workspaceId: string, id: string) {
    return categoryModel(await this.load(workspaceId, id));
  }

  async create(input: {
    workspaceId: string;
    name: string;
    parentId: string | null;
    by: string;
  }) {
    const now = this.clock();
    const category = MaterialCategory.create({
      id: newId(now.getTime()),
      workspaceId: input.workspaceId,
      name: input.name,
      parentId: input.parentId,
      by: input.by,
      now,
    });
    await this.checkParent({
      workspaceId: input.workspaceId,
      categoryId: null,
      parentId: input.parentId,
      keptParentId: null,
      childCount: 0,
    });
    await this.store.insert(category, {
      action: "material_category.created",
      before: null,
      by: input.by,
      now,
    });
    return this.get(input.workspaceId, category.id);
  }

  async update(
    input: Target & {
      name: string;
      parentId: string | null;
      expectedUpdatedAt: Date;
    },
  ) {
    const row = await this.load(input.workspaceId, input.id);
    const { category } = row;
    assertFresh("material_category", category.updatedAt, input.expectedUpdatedAt);
    if (category.isSeed) throw seedIsReadOnly("Material Category");
    await this.checkParent({
      workspaceId: input.workspaceId,
      categoryId: category.id,
      parentId: input.parentId,
      keptParentId: category.parentId,
      childCount: row.childCount,
    });
    const before = category.snapshot();
    const now = this.clock();
    category.update(input, input.by, now);
    await this.store.update(category, input.expectedUpdatedAt, {
      action: "material_category.updated",
      before,
      by: input.by,
      now,
    });
    return this.get(input.workspaceId, category.id);
  }

  async setDisabled(input: Target & { disabled: boolean }) {
    const row = await this.load(input.workspaceId, input.id);
    const { category } = row;
    const loadedAt = category.updatedAt;
    const before = category.snapshot();
    const now = this.clock();
    if (category.setDisabled(input.disabled, input.by, now))
      await this.store.update(category, loadedAt, {
        action: `material_category.${input.disabled ? "disabled" : "enabled"}`,
        before,
        by: input.by,
        now,
      });
    return categoryModel(row);
  }

  async delete(input: Target): Promise<void> {
    const { category } = await this.load(input.workspaceId, input.id);
    const loadedAt = category.updatedAt;
    const before = category.snapshot();
    const now = this.clock();
    category.delete(input.by, now);
    if (await this.store.inUse(input.workspaceId, input.id))
      throw masterInUse("material_category");
    await this.store.update(category, loadedAt, {
      action: "material_category.deleted",
      before,
      by: input.by,
      now,
    });
  }
}

// ---------------------------------------------------------------------------
// Materials

export type MaterialReadModel = {
  id: string;
  name: string;
  specification: string | null;
  uomId: string;
  uomName: string;
  categoryId: string | null;
  categoryName: string | null;
  itemType: MaterialItemType;
  /** Paise. */
  unitRate: number | null;
  discount: MaterialDiscount | null;
  gstRate: string | null;
  hsnCode: string | null;
  minStockQty: string | null;
  disabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function materialModel(row: MaterialRow): MaterialReadModel {
  const { material } = row;
  return {
    id: material.id,
    ...material.details,
    ...material.rate,
    uomName: row.uomName,
    categoryName: row.categoryName,
    disabled: material.disabled,
    createdAt: material.createdAt,
    updatedAt: material.updatedAt,
  };
}

/** A picked unit or category: new picks must be live and enabled (400). */
function assertPicked(
  kind: "measurement_unit" | "material_category",
  picked: PickedMaster | null,
  kept: boolean,
  id: string,
): void {
  const code =
    kind === "measurement_unit" ? "MEASUREMENT_UNIT" : "MATERIAL_CATEGORY";
  const label =
    kind === "measurement_unit" ? "Measurement Unit" : "Material Category";
  if (picked == null)
    throw new DomainError(
      `${code}_NOT_FOUND`,
      `Choose the ${label} from the list. It was not found.`,
      { details: { id } },
    );
  if (picked.disabled && !kept)
    throw new DomainError(
      `${code}_DISABLED`,
      `${picked.name} is disabled in Masters, so it cannot be chosen.`,
      { details: { id } },
    );
}

/**
 * Materials (CM-501). Rate Details are Financial: `rate: null` on create
 * means the writer cannot see them (stored empty), `"keep"` on update keeps
 * what is stored. A Material that procurement documents or stock entries
 * use cannot be deleted.
 */
export class MaterialHandlers {
  constructor(
    private readonly store: MaterialStore,
    private readonly clock: Clock = () => new Date(),
    /** Without it, delete does not look at procurement (unit tests). */
    private readonly usage?: MaterialUsage,
  ) {}

  private async load(workspaceId: string, id: string): Promise<MaterialRow> {
    const found = await this.store.find(workspaceId, id);
    if (found == null) throw masterNotFound("material");
    return found;
  }

  private async checkPicks(
    workspaceId: string,
    picks: { uomId: string; categoryId: string | null },
    current: { uomId: string; categoryId: string | null } | null,
  ): Promise<void> {
    const [unit, category] = await Promise.all([
      this.store.unit(workspaceId, picks.uomId),
      picks.categoryId == null
        ? null
        : this.store.category(workspaceId, picks.categoryId),
    ]);
    assertPicked(
      "measurement_unit",
      unit,
      current?.uomId === picks.uomId,
      picks.uomId,
    );
    if (picks.categoryId != null)
      assertPicked(
        "material_category",
        category,
        current?.categoryId === picks.categoryId,
        picks.categoryId,
      );
  }

  async list(params: MaterialListParams) {
    return mapPage(await this.store.list(params), materialModel);
  }

  async get(workspaceId: string, id: string) {
    return materialModel(await this.load(workspaceId, id));
  }

  async options(input: Parameters<MaterialStore["options"]>[0]) {
    return (await this.store.options(input)).map(materialModel);
  }

  async create(input: {
    workspaceId: string;
    details: MaterialDetailsInput;
    /** Null without Materials Financial: the rate stays empty. */
    rate: MaterialRateInput | null;
    by: string;
  }) {
    const now = this.clock();
    const material = Material.create({
      id: newId(now.getTime()),
      workspaceId: input.workspaceId,
      details: input.details,
      rate: input.rate ?? {},
      by: input.by,
      now,
    });
    await this.checkPicks(input.workspaceId, material.details, null);
    await this.store.insert(material, {
      action: "material.created",
      before: null,
      by: input.by,
      now,
    });
    return this.get(input.workspaceId, material.id);
  }

  async update(
    input: Target & {
      details: MaterialDetailsInput;
      rate: MaterialRateInput | "keep";
      expectedUpdatedAt: Date;
    },
  ) {
    const { material } = await this.load(input.workspaceId, input.id);
    assertFresh("material", material.updatedAt, input.expectedUpdatedAt);
    const before = material.snapshot();
    const now = this.clock();
    material.update(input, input.by, now);
    await this.checkPicks(input.workspaceId, material.details, before);
    await this.store.update(material, input.expectedUpdatedAt, {
      action: "material.updated",
      before,
      by: input.by,
      now,
    });
    return this.get(input.workspaceId, material.id);
  }

  async setDisabled(input: Target & { disabled: boolean }) {
    const row = await this.load(input.workspaceId, input.id);
    const { material } = row;
    const loadedAt = material.updatedAt;
    const before = material.snapshot();
    const now = this.clock();
    if (material.setDisabled(input.disabled, input.by, now))
      await this.store.update(material, loadedAt, {
        action: `material.${input.disabled ? "disabled" : "enabled"}`,
        before,
        by: input.by,
        now,
      });
    return materialModel(row);
  }

  /** 409 `MATERIAL_IN_USE` while a procurement line or stock entry names it. */
  async delete(input: Target): Promise<void> {
    const { material } = await this.load(input.workspaceId, input.id);
    const loadedAt = material.updatedAt;
    const before = material.snapshot();
    const now = this.clock();
    material.delete(input.by, now);
    if (
      this.usage != null &&
      (await this.usage(input.workspaceId, input.id))
    )
      throw masterInUse("material");
    await this.store.update(material, loadedAt, {
      action: "material.deleted",
      before,
      by: input.by,
      now,
    });
  }
}

// ---------------------------------------------------------------------------
// Terms & Conditions

export type TermsConditionReadModel = {
  id: string;
  title: string;
  body: string;
  disabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function termsModel(terms: TermsCondition): TermsConditionReadModel {
  return {
    id: terms.id,
    title: terms.title,
    body: terms.body,
    disabled: terms.disabled,
    createdAt: terms.createdAt,
    updatedAt: terms.updatedAt,
  };
}

/**
 * Terms & Conditions (CM-501, menu `masters.terms_conditions`). POs copy
 * the text, so any row can be edited or deleted.
 */
export class TermsConditionHandlers {
  constructor(
    private readonly store: TermsConditionStore,
    private readonly clock: Clock = () => new Date(),
  ) {}

  private async load(workspaceId: string, id: string) {
    const found = await this.store.find(workspaceId, id);
    if (found == null) throw masterNotFound("terms_condition");
    return found;
  }

  async list(params: MasterListParams) {
    return mapPage(await this.store.list(params), termsModel);
  }

  async get(workspaceId: string, id: string) {
    return termsModel(await this.load(workspaceId, id));
  }

  async create(input: {
    workspaceId: string;
    title: string;
    body: string;
    by: string;
  }) {
    const now = this.clock();
    const terms = TermsCondition.create({
      id: newId(now.getTime()),
      workspaceId: input.workspaceId,
      title: input.title,
      body: input.body,
      by: input.by,
      now,
    });
    await this.store.insert(terms, {
      action: "terms_condition.created",
      before: null,
      by: input.by,
      now,
    });
    return termsModel(terms);
  }

  async update(
    input: Target & { title: string; body: string; expectedUpdatedAt: Date },
  ) {
    const terms = await this.load(input.workspaceId, input.id);
    assertFresh("terms_condition", terms.updatedAt, input.expectedUpdatedAt);
    const before = terms.snapshot();
    const now = this.clock();
    terms.update(input, input.by, now);
    await this.store.update(terms, input.expectedUpdatedAt, {
      action: "terms_condition.updated",
      before,
      by: input.by,
      now,
    });
    return termsModel(terms);
  }

  async setDisabled(input: Target & { disabled: boolean }) {
    const terms = await this.load(input.workspaceId, input.id);
    const loadedAt = terms.updatedAt;
    const before = terms.snapshot();
    const now = this.clock();
    if (terms.setDisabled(input.disabled, input.by, now))
      await this.store.update(terms, loadedAt, {
        action: `terms_condition.${input.disabled ? "disabled" : "enabled"}`,
        before,
        by: input.by,
        now,
      });
    return termsModel(terms);
  }

  async delete(input: Target): Promise<void> {
    const terms = await this.load(input.workspaceId, input.id);
    const loadedAt = terms.updatedAt;
    const before = terms.snapshot();
    const now = this.clock();
    terms.delete(input.by, now);
    await this.store.update(terms, loadedAt, {
      action: "terms_condition.deleted",
      before,
      by: input.by,
      now,
    });
  }
}
