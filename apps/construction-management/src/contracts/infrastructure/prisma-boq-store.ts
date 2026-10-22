import { Prisma } from "@repo/construction-db";
import { isUniqueViolation } from "@/src/shared-kernel/prisma-errors";

import { userNamesInCompany } from "@/src/shared-kernel/user-names";

import type {
  BoqStore,
  LibraryItemFacts,
  StoredBoqItem,
  StoredBoqSection,
  StoredVariation,
} from "../application/boq-ports";
import type { ContractsTx } from "../application/ports";
import {
  BOQ_QUANTITY_SCALE,
  boqItemNoTaken,
  boqSectionTitleTaken,
  quantityText,
} from "../domain/boq";
import { DEVIATION_LIMIT_DEFAULT } from "../domain/deviation";
import {
  fixedDecimal,
  PERCENT_SCALE,
  scaledDecimal,
} from "../domain/item-analysis";

type SectionRow = Prisma.ConstructionContractsBoqSectionGetPayload<object>;
type ItemRow = Prisma.ConstructionContractsBoqItemGetPayload<object>;
type VariationRow = Prisma.ConstructionContractsVariationGetPayload<object>;

/** A `DECIMAL` read back as ten-thousandths (`12.5000` → 125000n). */
function quantity(value: { toString(): string }): bigint {
  return scaledDecimal(value.toString(), BOQ_QUANTITY_SCALE) ?? 0n;
}

function optionalQuantity(value: { toString(): string } | null): bigint | null {
  return value == null ? null : quantity(value);
}

function toSection(row: SectionRow): StoredBoqSection {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    title: row.title,
    position: row.position,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

function toItem(row: ItemRow): StoredBoqItem {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    sectionId: row.sectionId,
    itemId: row.itemId,
    itemNo: row.itemNo,
    description: row.description,
    uomId: row.uomId,
    sacHsn: row.sacHsn,
    originalQuantity: quantity(row.originalQuantity),
    quantity: quantity(row.quantity),
    originalRate: row.originalRate,
    rate: row.rate,
    wingId: row.wingId,
    locationId: row.locationId,
    position: row.position,
    variationId: row.variationId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

function toVariation(row: VariationRow): StoredVariation {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    number: row.number,
    kind: row.kind,
    status: row.status,
    boqItemId: row.boqItemId,
    sectionId: row.sectionId,
    itemNo: row.itemNo,
    description: row.description,
    uomId: row.uomId,
    sacHsn: row.sacHsn,
    previousQuantity: optionalQuantity(row.previousQuantity),
    newQuantity: optionalQuantity(row.newQuantity),
    previousRate: row.previousRate,
    newRate: row.newRate,
    reason: row.reason,
    decidedAt: row.decidedAt,
    decidedBy: row.decidedBy,
    rejectReason: row.rejectReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

/** The columns an item's fields write. */
function itemData(item: StoredBoqItem) {
  return {
    sectionId: item.sectionId,
    itemId: item.itemId,
    itemNo: item.itemNo,
    description: item.description,
    uomId: item.uomId,
    sacHsn: item.sacHsn,
    originalQuantity: quantityText(item.originalQuantity),
    quantity: quantityText(item.quantity),
    originalRate: item.originalRate,
    rate: item.rate,
    wingId: item.wingId,
    locationId: item.locationId,
    position: item.position,
    variationId: item.variationId,
  };
}

function variationData(variation: StoredVariation) {
  return {
    number: variation.number,
    kind: variation.kind,
    status: variation.status,
    boqItemId: variation.boqItemId,
    sectionId: variation.sectionId,
    itemNo: variation.itemNo,
    description: variation.description,
    uomId: variation.uomId,
    sacHsn: variation.sacHsn,
    previousQuantity:
      variation.previousQuantity == null
        ? null
        : quantityText(variation.previousQuantity),
    newQuantity:
      variation.newQuantity == null
        ? null
        : quantityText(variation.newQuantity),
    previousRate: variation.previousRate,
    newRate: variation.newRate,
    reason: variation.reason,
    decidedAt: variation.decidedAt,
    decidedBy: variation.decidedBy,
    rejectReason: variation.rejectReason,
  };
}

/** A partial unique index of `construction_contracts` refused the write. */
function uniqueTarget(error: unknown): string | null {
  if (!isUniqueViolation(error)) return null;
  return JSON.stringify(error.meta ?? {});
}

const LIBRARY_COLUMNS = Prisma.sql`id::text AS id, code, short_description AS "shortDescription",
  description, uom_id::text AS "uomId", sac_hsn AS "sacHsn", adopted_rate AS "adoptedRate"`;

/**
 * The BOQ, its Variations and the Company's contracts settings in
 * `construction_contracts` (CM-1103). Every method runs on the transaction
 * or client it is given.
 */
export class PrismaBoqStore implements BoqStore {
  async lock(tx: ContractsTx, workspaceId: string, projectId: string) {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`construction_contracts.boq:${workspaceId}:${projectId}`}, 0))`,
    );
  }

  // Sections -----------------------------------------------------------------

  async sections(db: ContractsTx, workspaceId: string, projectId: string) {
    const rows = await db.constructionContractsBoqSection.findMany({
      where: { workspaceId, projectId, deletedAt: null },
      orderBy: [{ position: "asc" }, { id: "asc" }],
    });
    return rows.map(toSection);
  }

  async findSection(db: ContractsTx, workspaceId: string, id: string) {
    const row = await db.constructionContractsBoqSection.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    return row == null ? null : toSection(row);
  }

  async sectionsById(
    db: ContractsTx,
    workspaceId: string,
    ids: readonly string[],
  ) {
    if (ids.length === 0) return new Map<string, StoredBoqSection>();
    const rows = await db.constructionContractsBoqSection.findMany({
      where: { workspaceId, id: { in: [...new Set(ids)] } },
    });
    return new Map(rows.map((row) => [row.id, toSection(row)]));
  }

  async sectionTitleTaken(
    tx: ContractsTx,
    projectId: string,
    title: string,
    exceptId: string | null,
  ) {
    const rows = await tx.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id::text AS id FROM construction_contracts.boq_sections
        WHERE project_id = ${projectId}::uuid AND deleted_at IS NULL
          AND lower(title) = lower(${title})
          AND (${exceptId}::uuid IS NULL OR id <> ${exceptId}::uuid)
        LIMIT 1`,
    );
    return rows.length > 0;
  }

  async insertSections(tx: ContractsTx, sections: StoredBoqSection[]) {
    try {
      await tx.constructionContractsBoqSection.createMany({
        data: sections.map((section) => ({ ...section })),
      });
    } catch (error) {
      if (uniqueTarget(error) != null)
        throw boqSectionTitleTaken(sections[0]?.title ?? "");
      throw error;
    }
  }

  async renameSection(
    tx: ContractsTx,
    input: Parameters<BoqStore["renameSection"]>[1],
  ) {
    try {
      const updated = await tx.constructionContractsBoqSection.updateMany({
        where: {
          id: input.section.id,
          deletedAt: null,
          updatedAt: input.expectedUpdatedAt,
        },
        data: { title: input.title, updatedAt: input.at, updatedBy: input.by },
      });
      return updated.count > 0;
    } catch (error) {
      if (uniqueTarget(error) != null) throw boqSectionTitleTaken(input.title);
      throw error;
    }
  }

  async setSectionOrder(
    tx: ContractsTx,
    ids: readonly string[],
    by: string,
    at: Date,
  ) {
    for (const [position, id] of ids.entries())
      await tx.constructionContractsBoqSection.update({
        where: { id },
        data: { position, updatedAt: at, updatedBy: by },
      });
  }

  async deleteSection(
    tx: ContractsTx,
    input: Parameters<BoqStore["deleteSection"]>[1],
  ) {
    const deleted = await tx.constructionContractsBoqSection.updateMany({
      where: {
        id: input.section.id,
        deletedAt: null,
        ...(input.expectedUpdatedAt == null
          ? {}
          : { updatedAt: input.expectedUpdatedAt }),
      },
      data: {
        deletedAt: input.at,
        deletedBy: input.by,
        updatedAt: input.at,
        updatedBy: input.by,
      },
    });
    return deleted.count > 0;
  }

  liveItemCount(tx: ContractsTx, sectionId: string) {
    return tx.constructionContractsBoqItem.count({
      where: { sectionId, deletedAt: null },
    });
  }

  // Items ----------------------------------------------------------------------

  async items(db: ContractsTx, workspaceId: string, projectId: string) {
    const rows = await db.constructionContractsBoqItem.findMany({
      where: { workspaceId, projectId, deletedAt: null },
      orderBy: [{ position: "asc" }, { id: "asc" }],
    });
    return rows.map(toItem);
  }

  async findItem(db: ContractsTx, workspaceId: string, id: string) {
    const row = await db.constructionContractsBoqItem.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    return row == null ? null : toItem(row);
  }

  async itemsById(
    db: ContractsTx,
    workspaceId: string,
    ids: readonly string[],
  ) {
    if (ids.length === 0) return new Map<string, StoredBoqItem>();
    const rows = await db.constructionContractsBoqItem.findMany({
      where: { workspaceId, id: { in: [...new Set(ids)] } },
    });
    return new Map(rows.map((row) => [row.id, toItem(row)]));
  }

  async takenItemNos(
    tx: ContractsTx,
    projectId: string,
    itemNos: readonly string[],
    exceptId: string | null,
  ) {
    if (itemNos.length === 0) return [];
    const lower = itemNos.map((itemNo) => itemNo.toLowerCase());
    const rows = await tx.$queryRaw<{ itemNo: string }[]>(
      Prisma.sql`SELECT item_no AS "itemNo" FROM construction_contracts.boq_items
        WHERE project_id = ${projectId}::uuid AND deleted_at IS NULL
          AND lower(item_no) = ANY(${lower}::text[])
          AND (${exceptId}::uuid IS NULL OR id <> ${exceptId}::uuid)`,
    );
    return rows.map((row) => row.itemNo);
  }

  async insertItems(tx: ContractsTx, items: StoredBoqItem[]) {
    if (items.length === 0) return;
    try {
      await tx.constructionContractsBoqItem.createMany({
        data: items.map((item) => ({
          id: item.id,
          workspaceId: item.workspaceId,
          projectId: item.projectId,
          ...itemData(item),
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          createdBy: item.createdBy,
          updatedBy: item.updatedBy,
        })),
      });
    } catch (error) {
      if (uniqueTarget(error) != null)
        throw boqItemNoTaken(items[0]?.itemNo ?? "");
      throw error;
    }
  }

  async updateItem(
    tx: ContractsTx,
    after: StoredBoqItem,
    expectedUpdatedAt: Date | null,
  ) {
    try {
      const updated = await tx.constructionContractsBoqItem.updateMany({
        where: {
          id: after.id,
          deletedAt: null,
          ...(expectedUpdatedAt == null
            ? {}
            : { updatedAt: expectedUpdatedAt }),
        },
        data: {
          ...itemData(after),
          updatedAt: after.updatedAt,
          updatedBy: after.updatedBy,
        },
      });
      return updated.count > 0;
    } catch (error) {
      if (uniqueTarget(error) != null) throw boqItemNoTaken(after.itemNo);
      throw error;
    }
  }

  async setItemOrder(
    tx: ContractsTx,
    ids: readonly string[],
    by: string,
    at: Date,
  ) {
    for (const [position, id] of ids.entries())
      await tx.constructionContractsBoqItem.update({
        where: { id },
        data: { position, updatedAt: at, updatedBy: by },
      });
  }

  async deleteItem(
    tx: ContractsTx,
    input: Parameters<BoqStore["deleteItem"]>[1],
  ) {
    const deleted = await tx.constructionContractsBoqItem.updateMany({
      where: {
        id: input.item.id,
        deletedAt: null,
        ...(input.expectedUpdatedAt == null
          ? {}
          : { updatedAt: input.expectedUpdatedAt }),
      },
      data: {
        deletedAt: input.at,
        deletedBy: input.by,
        updatedAt: input.at,
        updatedBy: input.by,
      },
    });
    return deleted.count > 0;
  }

  async workOrdersNaming(
    db: ContractsTx,
    workspaceId: string,
    boqItemId: string,
  ) {
    const rows = await db.$queryRaw<{ number: string | null }[]>(
      Prisma.sql`SELECT DISTINCT w.number
        FROM construction_contracts.work_order_lines l
        JOIN construction_contracts.work_orders w ON w.id = l.work_order_id
        WHERE l.workspace_id = ${workspaceId} AND w.workspace_id = ${workspaceId}
          AND l.boq_item_id = ${boqItemId}::uuid AND l.deleted_at IS NULL
          AND w.deleted_at IS NULL AND w.status <> 'cancelled'
        ORDER BY w.number NULLS LAST`,
    );
    return rows.map((row) => row.number ?? "Draft");
  }

  async measured(db: ContractsTx, workspaceId: string, projectId: string) {
    const rows = await db.$queryRaw<{ id: string; measured: string }[]>(
      Prisma.sql`SELECT r.boq_item_id::text AS id, SUM(r.quantity)::text AS measured
        FROM construction_contracts.measurement_rows r
        JOIN construction_contracts.measurement_sheets s ON s.id = r.sheet_id
        WHERE r.workspace_id = ${workspaceId} AND s.workspace_id = ${workspaceId}
          AND s.project_id = ${projectId}::uuid
          AND s.deleted_at IS NULL AND s.status = 'checked'
          AND r.boq_item_id IS NOT NULL
        GROUP BY r.boq_item_id`,
    );
    return new Map(
      rows.map((row) => [
        row.id,
        scaledDecimal(row.measured, BOQ_QUANTITY_SCALE) ?? 0n,
      ]),
    );
  }

  // The Item Library -------------------------------------------------------------

  async lockLibraryItems(
    tx: ContractsTx,
    workspaceId: string,
    ids: readonly string[],
  ) {
    if (ids.length === 0) return new Map<string, LibraryItemFacts>();
    const rows = await tx.$queryRaw<LibraryItemFacts[]>(
      Prisma.sql`SELECT ${LIBRARY_COLUMNS} FROM construction_contracts.items
        WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL
          AND id = ANY(${[...new Set(ids)]}::uuid[])
        ORDER BY id
        FOR SHARE`,
    );
    return new Map(rows.map((row) => [row.id, row]));
  }

  async lockLibraryItemsByCode(
    tx: ContractsTx,
    workspaceId: string,
    codes: readonly string[],
  ) {
    if (codes.length === 0) return [];
    const lower = [...new Set(codes.map((code) => code.trim().toLowerCase()))];
    return tx.$queryRaw<LibraryItemFacts[]>(
      Prisma.sql`SELECT ${LIBRARY_COLUMNS} FROM construction_contracts.items
        WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL
          AND lower(code) = ANY(${lower}::text[])
        ORDER BY id
        FOR SHARE`,
    );
  }

  async libraryOptions(
    db: ContractsTx,
    workspaceId: string,
    query: { search?: string; limit: number },
  ) {
    const search = query.search?.trim() ?? "";
    const contains = { contains: search, mode: "insensitive" as const };
    const rows = await db.constructionContractsItem.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        ...(search === ""
          ? {}
          : {
              OR: [
                { code: contains },
                { shortDescription: contains },
                { description: contains },
              ],
            }),
      },
      orderBy: [{ code: "asc" }, { id: "asc" }],
      take: query.limit,
    });
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      shortDescription: row.shortDescription,
      description: row.description,
      uomId: row.uomId,
      sacHsn: row.sacHsn,
      adoptedRate: row.adoptedRate,
    }));
  }

  async libraryCodes(
    db: ContractsTx,
    workspaceId: string,
    ids: readonly string[],
  ) {
    if (ids.length === 0) return new Map<string, string>();
    const rows = await db.constructionContractsItem.findMany({
      where: { workspaceId, id: { in: [...new Set(ids)] } },
      select: { id: true, code: true },
    });
    return new Map(rows.map((row) => [row.id, row.code]));
  }

  // Settings ---------------------------------------------------------------------

  async settings(db: ContractsTx, workspaceId: string) {
    const row = await db.constructionContractsSettings.findUnique({
      where: { workspaceId },
    });
    return {
      deviationLimit:
        row == null
          ? DEVIATION_LIMIT_DEFAULT
          : (scaledDecimal(
              row.deviationLimitPercent.toString(),
              PERCENT_SCALE,
            ) ?? DEVIATION_LIMIT_DEFAULT),
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updatedBy ?? null,
    };
  }

  async saveDeviationLimit(
    tx: ContractsTx,
    input: Parameters<BoqStore["saveDeviationLimit"]>[1],
  ) {
    const value = fixedDecimal(input.limit, PERCENT_SCALE);
    await tx.constructionContractsSettings.upsert({
      where: { workspaceId: input.workspaceId },
      create: {
        workspaceId: input.workspaceId,
        deviationLimitPercent: value,
        updatedAt: input.at,
        updatedBy: input.by,
      },
      update: {
        deviationLimitPercent: value,
        updatedAt: input.at,
        updatedBy: input.by,
      },
    });
  }

  // Variations ---------------------------------------------------------------------

  async variations(
    db: ContractsTx,
    params: Parameters<BoqStore["variations"]>[1],
  ) {
    const filters: Prisma.ConstructionContractsVariationWhereInput[] = [
      {
        workspaceId: params.workspaceId,
        projectId: params.projectId,
        deletedAt: null,
        ...(params.status == null ? {} : { status: params.status }),
        ...(params.boqItemId == null ? {} : { boqItemId: params.boqItemId }),
      },
    ];
    const backwards = params.before != null;
    const cursor = params.after ?? params.before;
    const paged =
      cursor == null
        ? filters
        : [
            ...filters,
            {
              OR: backwards
                ? [
                    { createdAt: { gt: cursor.createdAt } },
                    { createdAt: cursor.createdAt, id: { gt: cursor.id } },
                  ]
                : [
                    { createdAt: { lt: cursor.createdAt } },
                    { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                  ],
            },
          ];
    const direction = backwards ? ("asc" as const) : ("desc" as const);
    const [rows, total] = await Promise.all([
      db.constructionContractsVariation.findMany({
        where: { AND: paged },
        orderBy: [{ createdAt: direction }, { id: direction }],
        take: params.limit + 1,
      }),
      db.constructionContractsVariation.count({ where: { AND: filters } }),
    ]);
    const hasMore = rows.length > params.limit;
    const page = rows.slice(0, params.limit);
    if (backwards) page.reverse();
    return { items: page.map(toVariation), total, hasMore };
  }

  async variationsOfItems(
    db: ContractsTx,
    workspaceId: string,
    boqItemIds: readonly string[],
  ) {
    if (boqItemIds.length === 0) return [];
    const rows = await db.constructionContractsVariation.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        boqItemId: { in: [...boqItemIds] },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return rows.map(toVariation);
  }

  async pendingVariations(
    db: ContractsTx,
    workspaceId: string,
    projectId: string,
  ) {
    const rows = await db.constructionContractsVariation.findMany({
      where: {
        workspaceId,
        projectId,
        deletedAt: null,
        status: "pending_approval",
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map(toVariation);
  }

  async findVariation(db: ContractsTx, workspaceId: string, id: string) {
    const row = await db.constructionContractsVariation.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    return row == null ? null : toVariation(row);
  }

  async insertVariation(tx: ContractsTx, variation: StoredVariation) {
    await tx.constructionContractsVariation.create({
      data: {
        id: variation.id,
        workspaceId: variation.workspaceId,
        projectId: variation.projectId,
        ...variationData(variation),
        createdAt: variation.createdAt,
        updatedAt: variation.updatedAt,
        createdBy: variation.createdBy,
        updatedBy: variation.updatedBy,
      },
    });
  }

  async updateVariation(
    tx: ContractsTx,
    after: StoredVariation,
    expectedUpdatedAt: Date | null,
  ) {
    const updated = await tx.constructionContractsVariation.updateMany({
      where: {
        id: after.id,
        deletedAt: null,
        ...(expectedUpdatedAt == null ? {} : { updatedAt: expectedUpdatedAt }),
      },
      data: {
        ...variationData(after),
        updatedAt: after.updatedAt,
        updatedBy: after.updatedBy,
      },
    });
    return updated.count > 0;
  }

  async deleteVariation(
    tx: ContractsTx,
    input: Parameters<BoqStore["deleteVariation"]>[1],
  ) {
    const deleted = await tx.constructionContractsVariation.updateMany({
      where: {
        id: input.variation.id,
        deletedAt: null,
        ...(input.expectedUpdatedAt == null
          ? {}
          : { updatedAt: input.expectedUpdatedAt }),
      },
      data: {
        deletedAt: input.at,
        deletedBy: input.by,
        updatedAt: input.at,
        updatedBy: input.by,
      },
    });
    return deleted.count > 0;
  }

  names(db: ContractsTx, workspaceId: string, userIds: readonly string[]) {
    return userNamesInCompany(db, workspaceId, userIds);
  }
}
