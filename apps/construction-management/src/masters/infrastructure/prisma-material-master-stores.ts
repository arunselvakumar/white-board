import { Prisma, type PrismaClient } from "@repo/construction-db";

import { recordAudit } from "@/src/shared-kernel/audit";
import { DomainError, conflict } from "@/src/shared-kernel/domain-error";

import type {
  MasterListParams,
  MasterPage,
  MaterialCategoryListParams,
  MaterialCategoryRow,
  MaterialCategoryStore,
  MaterialListParams,
  MaterialRow,
  MaterialStore,
  MeasurementUnit,
  MeasurementUnitStore,
  PickedMaster,
  TermsConditionStore,
} from "../application/material-ports";
import type { MasterChange } from "../application/ports";
import { LookupEntry } from "../domain/lookup-entry";
import {
  masterChanged,
  masterNameInUse,
  type MasterKind,
} from "../domain/master-kind";
import { Material, type MaterialDiscount } from "../domain/material";
import { MaterialCategory } from "../domain/material-category";
import { TermsCondition } from "../domain/terms-condition";
import { isUniqueViolation } from "./prisma-lookup-store";
import { pageOf, pageQuery, statusFilter } from "./prisma-paging";

type Tx = Prisma.TransactionClient;

type Audited = {
  id: string;
  workspaceId: string;
  deletedAt: Date | null;
  snapshot(): unknown;
};

function audit(kind: MasterKind, row: Audited, change: MasterChange) {
  return {
    workspaceId: row.workspaceId,
    actorUserId: change.by,
    action: change.action,
    entityType: kind,
    entityId: row.id,
    before: change.before,
    after: row.deletedAt == null ? row.snapshot() : null,
    occurredAt: change.now,
  };
}

/** Runs a write, turning the live-name index into `<KIND>_NAME_IN_USE`. */
async function write(
  kind: MasterKind,
  run: () => Promise<void>,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (isUniqueViolation(error)) throw masterNameInUse(kind);
    throw error;
  }
}

function contains(search: string | undefined) {
  const value = search?.trim() ?? "";
  return value === ""
    ? null
    : { contains: value, mode: "insensitive" as const };
}

function compact<T>(filters: (T | null | undefined | false)[]): T[] {
  return filters.filter((item): item is T => item != null && item !== false);
}

// ---------------------------------------------------------------------------

type UnitRow = Prisma.ConstructionMastersMeasurementUnitGetPayload<object>;

function toUnit(row: UnitRow): MeasurementUnit {
  return LookupEntry.reconstitute({ ...row, kind: "measurement_unit" });
}

/** `construction_masters.measurement_units` (CM-501). */
export class PrismaMeasurementUnitStore implements MeasurementUnitStore {
  constructor(private readonly db: PrismaClient) {}

  async list(params: MasterListParams): Promise<MasterPage<MeasurementUnit>> {
    const name = contains(params.search);
    const filters =
      compact<Prisma.ConstructionMastersMeasurementUnitWhereInput>([
        { workspaceId: params.workspaceId, deletedAt: null },
        statusFilter(params.status),
        name == null ? null : { name },
      ]);
    const page = pageQuery(params);
    const [rows, total] = await Promise.all([
      this.db.constructionMastersMeasurementUnit.findMany({
        where: { AND: compact([...filters, page.filter]) },
        orderBy: page.orderBy,
        take: page.take,
      }),
      this.db.constructionMastersMeasurementUnit.count({
        where: { AND: filters },
      }),
    ]);
    const { items, hasMore } = pageOf(rows, params);
    return { items: items.map(toUnit), total, hasMore };
  }

  async find(workspaceId: string, id: string) {
    const row = await this.db.constructionMastersMeasurementUnit.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    return row == null ? null : toUnit(row);
  }

  async insert(unit: MeasurementUnit, change: MasterChange) {
    await write("measurement_unit", () =>
      this.db.$transaction(async (tx) => {
        await tx.constructionMastersMeasurementUnit.create({
          data: {
            id: unit.id,
            workspaceId: unit.workspaceId,
            name: unit.name,
            isSeed: unit.isSeed,
            disabledAt: unit.disabledAt,
            createdAt: unit.createdAt,
            updatedAt: unit.updatedAt,
            createdBy: unit.createdBy,
            updatedBy: unit.updatedBy,
          },
        });
        await recordAudit(tx, audit("measurement_unit", unit, change));
      }),
    );
  }

  async update(unit: MeasurementUnit, expected: Date, change: MasterChange) {
    await write("measurement_unit", () =>
      this.db.$transaction(async (tx) => {
        const updated = await tx.constructionMastersMeasurementUnit.updateMany({
          where: {
            id: unit.id,
            workspaceId: unit.workspaceId,
            deletedAt: null,
            updatedAt: expected,
          },
          data: {
            name: unit.name,
            disabledAt: unit.disabledAt,
            updatedAt: unit.updatedAt,
            updatedBy: unit.updatedBy,
            deletedAt: unit.deletedAt,
            deletedBy: unit.deletedBy,
          },
        });
        if (updated.count === 0) throw masterChanged("measurement_unit");
        await recordAudit(tx, audit("measurement_unit", unit, change));
      }),
    );
  }

  async inUse(workspaceId: string, id: string): Promise<boolean> {
    const used = await this.db.constructionMastersMaterial.findFirst({
      where: { workspaceId, uomId: id, deletedAt: null },
      select: { id: true },
    });
    return used != null;
  }
}

// ---------------------------------------------------------------------------

const CATEGORY_INCLUDE = {
  parent: { select: { name: true } },
  _count: { select: { children: { where: { deletedAt: null } } } },
} satisfies Prisma.ConstructionMastersMaterialCategoryInclude;

type CategoryRecord = Prisma.ConstructionMastersMaterialCategoryGetPayload<{
  include: typeof CATEGORY_INCLUDE;
}>;

function toCategoryRow(row: CategoryRecord): MaterialCategoryRow {
  const { parent, _count, ...props } = row;
  return {
    category: MaterialCategory.reconstitute(props),
    parentName: parent?.name ?? null,
    childCount: _count.children,
  };
}

/**
 * Inside the write's transaction: the parent is still a live top-level
 * category, and a category that gets a parent still has no children. The
 * rows are locked so two edits at once cannot build a third level.
 */
async function recheckHierarchy(
  tx: Tx,
  category: MaterialCategory,
): Promise<void> {
  if (category.parentId == null) return;
  const parents = await tx.$queryRaw<{ parent_id: string | null }[]>(
    Prisma.sql`
      SELECT parent_id::text FROM construction_masters.material_categories
      WHERE id = ${category.parentId}::uuid
        AND workspace_id = ${category.workspaceId}
        AND deleted_at IS NULL
      FOR UPDATE
    `,
  );
  const parent = parents[0];
  if (parent == null)
    throw new DomainError(
      "MATERIAL_CATEGORY_NOT_FOUND",
      "Choose the parent category from the list. It was not found.",
    );
  if (parent.parent_id != null)
    throw new DomainError(
      "MATERIAL_CATEGORY_PARENT_INVALID",
      "The parent is itself a sub-category. Choose a top-level category as the parent.",
    );
  // Lock this category too: a child created under it meanwhile then waits
  // for this edit, or is counted by it (no third level either way).
  await tx.$queryRaw(Prisma.sql`
    SELECT 1 FROM construction_masters.material_categories
    WHERE id = ${category.id}::uuid
    FOR UPDATE
  `);
  const children = await tx.constructionMastersMaterialCategory.count({
    where: { parentId: category.id, deletedAt: null },
  });
  if (children > 0)
    throw conflict(
      "MATERIAL_CATEGORY_HAS_CHILDREN",
      "This Material Category has sub-categories, so it cannot be put under another one. Move its sub-categories first.",
    );
}

/** `construction_masters.material_categories` (CM-501). */
export class PrismaMaterialCategoryStore implements MaterialCategoryStore {
  constructor(private readonly db: PrismaClient) {}

  async list(
    params: MaterialCategoryListParams,
  ): Promise<MasterPage<MaterialCategoryRow>> {
    const name = contains(params.search);
    const filters =
      compact<Prisma.ConstructionMastersMaterialCategoryWhereInput>([
        { workspaceId: params.workspaceId, deletedAt: null },
        statusFilter(params.status),
        name == null ? null : { name },
        params.topLevel === true ? { parentId: null } : null,
        params.parentId == null ? null : { parentId: params.parentId },
      ]);
    const page = pageQuery(params);
    const [rows, total] = await Promise.all([
      this.db.constructionMastersMaterialCategory.findMany({
        where: { AND: compact([...filters, page.filter]) },
        orderBy: page.orderBy,
        take: page.take,
        include: CATEGORY_INCLUDE,
      }),
      this.db.constructionMastersMaterialCategory.count({
        where: { AND: filters },
      }),
    ]);
    const { items, hasMore } = pageOf(rows, params);
    return { items: items.map(toCategoryRow), total, hasMore };
  }

  async find(workspaceId: string, id: string) {
    const row = await this.db.constructionMastersMaterialCategory.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: CATEGORY_INCLUDE,
    });
    return row == null ? null : toCategoryRow(row);
  }

  async insert(category: MaterialCategory, change: MasterChange) {
    await write("material_category", () =>
      this.db.$transaction(async (tx) => {
        await recheckHierarchy(tx, category);
        await tx.constructionMastersMaterialCategory.create({
          data: {
            id: category.id,
            workspaceId: category.workspaceId,
            name: category.name,
            parentId: category.parentId,
            isSeed: category.isSeed,
            disabledAt: category.disabledAt,
            createdAt: category.createdAt,
            updatedAt: category.updatedAt,
            createdBy: category.createdBy,
            updatedBy: category.updatedBy,
          },
        });
        await recordAudit(tx, audit("material_category", category, change));
      }),
    );
  }

  async update(
    category: MaterialCategory,
    expected: Date,
    change: MasterChange,
  ) {
    await write("material_category", () =>
      this.db.$transaction(async (tx) => {
        if (category.deletedAt == null) await recheckHierarchy(tx, category);
        const updated = await tx.constructionMastersMaterialCategory.updateMany(
          {
            where: {
              id: category.id,
              workspaceId: category.workspaceId,
              deletedAt: null,
              updatedAt: expected,
            },
            data: {
              name: category.name,
              parentId: category.parentId,
              disabledAt: category.disabledAt,
              updatedAt: category.updatedAt,
              updatedBy: category.updatedBy,
              deletedAt: category.deletedAt,
              deletedBy: category.deletedBy,
            },
          },
        );
        if (updated.count === 0) throw masterChanged("material_category");
        await recordAudit(tx, audit("material_category", category, change));
      }),
    );
  }

  async inUse(workspaceId: string, id: string): Promise<boolean> {
    const [material, child] = await Promise.all([
      this.db.constructionMastersMaterial.findFirst({
        where: { workspaceId, categoryId: id, deletedAt: null },
        select: { id: true },
      }),
      this.db.constructionMastersMaterialCategory.findFirst({
        where: { workspaceId, parentId: id, deletedAt: null },
        select: { id: true },
      }),
    ]);
    return material != null || child != null;
  }
}

// ---------------------------------------------------------------------------

const MATERIAL_INCLUDE = {
  uom: { select: { name: true } },
  category: { select: { name: true } },
} satisfies Prisma.ConstructionMastersMaterialInclude;

type MaterialRecord = Prisma.ConstructionMastersMaterialGetPayload<{
  include: typeof MATERIAL_INCLUDE;
}>;

function discountOf(row: MaterialRecord): MaterialDiscount | null {
  if (row.discountType === "amount" && row.discountAmount != null)
    return { type: "amount", paise: Number(row.discountAmount) };
  if (row.discountType === "percent" && row.discountPercent != null)
    return { type: "percent", percent: row.discountPercent.toFixed(2) };
  return null;
}

function toMaterialRow(row: MaterialRecord): MaterialRow {
  return {
    material: Material.reconstitute({
      id: row.id,
      workspaceId: row.workspaceId,
      name: row.name,
      specification: row.specification,
      uomId: row.uomId,
      categoryId: row.categoryId,
      itemType: row.itemType,
      minStockQty: row.minStockQty?.toFixed(3) ?? null,
      unitRate: row.unitRate == null ? null : Number(row.unitRate),
      discount: discountOf(row),
      gstRate: row.gstRate?.toFixed(2) ?? null,
      hsnCode: row.hsnCode,
      disabledAt: row.disabledAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
      deletedAt: row.deletedAt,
      deletedBy: row.deletedBy,
    }),
    uomName: row.uom.name,
    categoryName: row.category?.name ?? null,
  };
}

function materialColumns(material: Material) {
  const { details, rate } = material;
  return {
    name: details.name,
    specification: details.specification,
    uomId: details.uomId,
    categoryId: details.categoryId,
    itemType: details.itemType,
    minStockQty:
      details.minStockQty == null
        ? null
        : new Prisma.Decimal(details.minStockQty),
    unitRate: rate.unitRate == null ? null : BigInt(rate.unitRate),
    discountType: rate.discount?.type ?? null,
    discountAmount:
      rate.discount?.type === "amount" ? BigInt(rate.discount.paise) : null,
    discountPercent:
      rate.discount?.type === "percent"
        ? new Prisma.Decimal(rate.discount.percent)
        : null,
    gstRate: rate.gstRate == null ? null : new Prisma.Decimal(rate.gstRate),
    hsnCode: rate.hsnCode,
    disabledAt: material.disabledAt,
  };
}

/** `construction_masters.materials` (CM-501). */
export class PrismaMaterialStore implements MaterialStore {
  constructor(private readonly db: PrismaClient) {}

  async list(params: MaterialListParams): Promise<MasterPage<MaterialRow>> {
    const text = contains(params.search);
    const filters = compact<Prisma.ConstructionMastersMaterialWhereInput>([
      { workspaceId: params.workspaceId, deletedAt: null },
      statusFilter(params.status),
      text == null
        ? null
        : {
            OR: [
              { name: text },
              { specification: text },
              { hsnCode: { contains: params.search?.trim() ?? "" } },
            ],
          },
      params.categoryId == null ? null : { categoryId: params.categoryId },
      params.itemType == null ? null : { itemType: params.itemType },
    ]);
    const page = pageQuery(params);
    const [rows, total] = await Promise.all([
      this.db.constructionMastersMaterial.findMany({
        where: { AND: compact([...filters, page.filter]) },
        orderBy: page.orderBy,
        take: page.take,
        include: MATERIAL_INCLUDE,
      }),
      this.db.constructionMastersMaterial.count({ where: { AND: filters } }),
    ]);
    const { items, hasMore } = pageOf(rows, params);
    return { items: items.map(toMaterialRow), total, hasMore };
  }

  async find(workspaceId: string, id: string) {
    const row = await this.db.constructionMastersMaterial.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: MATERIAL_INCLUDE,
    });
    return row == null ? null : toMaterialRow(row);
  }

  async options(input: Parameters<MaterialStore["options"]>[0]) {
    const text = contains(input.search);
    const where: Prisma.ConstructionMastersMaterialWhereInput =
      input.ids != null
        ? {
            workspaceId: input.workspaceId,
            deletedAt: null,
            id: { in: [...new Set(input.ids)] },
          }
        : {
            workspaceId: input.workspaceId,
            deletedAt: null,
            disabledAt: null,
            ...(input.categoryId == null
              ? {}
              : {
                  OR: [
                    { categoryId: input.categoryId },
                    { category: { parentId: input.categoryId } },
                  ],
                }),
            ...(text == null
              ? {}
              : { AND: [{ OR: [{ name: text }, { specification: text }] }] }),
          };
    const rows = await this.db.constructionMastersMaterial.findMany({
      where,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: input.limit,
      include: MATERIAL_INCLUDE,
    });
    return rows.map(toMaterialRow);
  }

  async insert(material: Material, change: MasterChange) {
    await write("material", () =>
      this.db.$transaction(async (tx) => {
        await tx.constructionMastersMaterial.create({
          data: {
            id: material.id,
            workspaceId: material.workspaceId,
            ...materialColumns(material),
            createdAt: material.createdAt,
            updatedAt: material.updatedAt,
            createdBy: material.createdBy,
            updatedBy: material.updatedBy,
          },
        });
        await recordAudit(tx, audit("material", material, change));
      }),
    );
  }

  async update(material: Material, expected: Date, change: MasterChange) {
    await write("material", () =>
      this.db.$transaction(async (tx) => {
        const updated = await tx.constructionMastersMaterial.updateMany({
          where: {
            id: material.id,
            workspaceId: material.workspaceId,
            deletedAt: null,
            updatedAt: expected,
          },
          data: {
            ...materialColumns(material),
            updatedAt: material.updatedAt,
            updatedBy: material.updatedBy,
            deletedAt: material.deletedAt,
            deletedBy: material.deletedBy,
          },
        });
        if (updated.count === 0) throw masterChanged("material");
        await recordAudit(tx, audit("material", material, change));
      }),
    );
  }

  async unit(workspaceId: string, id: string): Promise<PickedMaster | null> {
    const row = await this.db.constructionMastersMeasurementUnit.findFirst({
      where: { id, workspaceId, deletedAt: null },
      select: { id: true, name: true, disabledAt: true },
    });
    return row == null
      ? null
      : { id: row.id, name: row.name, disabled: row.disabledAt != null };
  }

  async category(
    workspaceId: string,
    id: string,
  ): Promise<PickedMaster | null> {
    const row = await this.db.constructionMastersMaterialCategory.findFirst({
      where: { id, workspaceId, deletedAt: null },
      select: { id: true, name: true, disabledAt: true },
    });
    return row == null
      ? null
      : { id: row.id, name: row.name, disabled: row.disabledAt != null };
  }
}

// ---------------------------------------------------------------------------

type TermsRow = Prisma.ConstructionMastersTermsConditionGetPayload<object>;

const toTerms = (row: TermsRow) => TermsCondition.reconstitute(row);

/** `construction_masters.terms_conditions` (CM-501). */
export class PrismaTermsConditionStore implements TermsConditionStore {
  constructor(private readonly db: PrismaClient) {}

  async list(params: MasterListParams): Promise<MasterPage<TermsCondition>> {
    const text = contains(params.search);
    const filters = compact<Prisma.ConstructionMastersTermsConditionWhereInput>(
      [
        { workspaceId: params.workspaceId, deletedAt: null },
        statusFilter(params.status),
        text == null ? null : { OR: [{ title: text }, { body: text }] },
      ],
    );
    const page = pageQuery(params);
    const [rows, total] = await Promise.all([
      this.db.constructionMastersTermsCondition.findMany({
        where: { AND: compact([...filters, page.filter]) },
        orderBy: page.orderBy,
        take: page.take,
      }),
      this.db.constructionMastersTermsCondition.count({
        where: { AND: filters },
      }),
    ]);
    const { items, hasMore } = pageOf(rows, params);
    return { items: items.map(toTerms), total, hasMore };
  }

  async find(workspaceId: string, id: string) {
    const row = await this.db.constructionMastersTermsCondition.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    return row == null ? null : toTerms(row);
  }

  async insert(terms: TermsCondition, change: MasterChange) {
    await write("terms_condition", () =>
      this.db.$transaction(async (tx) => {
        await tx.constructionMastersTermsCondition.create({
          data: {
            id: terms.id,
            workspaceId: terms.workspaceId,
            title: terms.title,
            body: terms.body,
            disabledAt: terms.disabledAt,
            createdAt: terms.createdAt,
            updatedAt: terms.updatedAt,
            createdBy: terms.createdBy,
            updatedBy: terms.updatedBy,
          },
        });
        await recordAudit(tx, audit("terms_condition", terms, change));
      }),
    );
  }

  async update(terms: TermsCondition, expected: Date, change: MasterChange) {
    await write("terms_condition", () =>
      this.db.$transaction(async (tx) => {
        const updated = await tx.constructionMastersTermsCondition.updateMany({
          where: {
            id: terms.id,
            workspaceId: terms.workspaceId,
            deletedAt: null,
            updatedAt: expected,
          },
          data: {
            title: terms.title,
            body: terms.body,
            disabledAt: terms.disabledAt,
            updatedAt: terms.updatedAt,
            updatedBy: terms.updatedBy,
            deletedAt: terms.deletedAt,
            deletedBy: terms.deletedBy,
          },
        });
        if (updated.count === 0) throw masterChanged("terms_condition");
        await recordAudit(tx, audit("terms_condition", terms, change));
      }),
    );
  }
}
