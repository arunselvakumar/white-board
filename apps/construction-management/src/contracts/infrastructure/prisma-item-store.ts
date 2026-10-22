import { Prisma, prisma, type PrismaClient } from "@repo/construction-db";
import { isUniqueViolation } from "@/src/shared-kernel/prisma-errors";

import { recordAudit } from "@/src/shared-kernel/audit";
import { newId } from "@/src/shared-kernel/ids";

import {
  ItemHandlers,
  type ItemFilter,
  type ItemListParams,
  type ItemStore,
  type ItemSummary,
  type StoredItem,
  type StoredItemLine,
} from "../application/item-handlers";
import type { ContractsDirectory } from "../application/ports";
import {
  itemChanged,
  itemCodeTaken,
  itemInUse,
  itemNotFound,
} from "../domain/item";
import {
  COEFFICIENT_SCALE,
  fixedDecimal,
  PERCENT_SCALE,
  scaledDecimal,
} from "../domain/item-analysis";

type Tx = Prisma.TransactionClient;

const SUMMARY_INCLUDE = { _count: { select: { analysis: true } } } as const;
type SummaryRow = Prisma.ConstructionContractsItemGetPayload<{
  include: typeof SUMMARY_INCLUDE;
}>;
type LineRow = Prisma.ConstructionContractsItemAnalysisLineGetPayload<object>;

/** A `DECIMAL` read back at its scale (`15.00` → 1500n). */
function scaled(value: { toString(): string }, scale: number): bigint {
  return scaledDecimal(value.toString(), scale) ?? 0n;
}

function toSummary(
  row: Omit<SummaryRow, "_count">,
  lineCount: number,
): ItemSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    code: row.code,
    shortDescription: row.shortDescription,
    description: row.description,
    uomId: row.uomId,
    sacHsn: row.sacHsn,
    schedule: row.schedule,
    adoptedRate: row.adoptedRate,
    overheadPercent:
      row.overheadPercent == null
        ? null
        : scaled(row.overheadPercent, PERCENT_SCALE),
    analysedRate: row.analysedRate,
    lineCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

function toLine(row: LineRow): StoredItemLine {
  return {
    id: row.id,
    position: row.position,
    kind: row.kind,
    materialId: row.materialId,
    labourCategoryId: row.labourCategoryId,
    equipmentId: row.equipmentId,
    description: row.description,
    coefficient: scaled(row.coefficient, COEFFICIENT_SCALE),
    resourceUomId: row.resourceUomId,
    rate: row.rate,
    amount: row.amount,
  };
}

/** The columns an Item's fields write. */
function fieldsData(item: ItemSummary) {
  return {
    code: item.code,
    shortDescription: item.shortDescription,
    description: item.description,
    uomId: item.uomId,
    sacHsn: item.sacHsn,
    schedule: item.schedule,
    adoptedRate: item.adoptedRate,
    overheadPercent:
      item.overheadPercent == null
        ? null
        : fixedDecimal(item.overheadPercent, PERCENT_SCALE),
    analysedRate: item.analysedRate,
  };
}

function linesData(item: StoredItem) {
  return item.lines.map((line) => ({
    id: line.id,
    workspaceId: item.workspaceId,
    itemId: item.id,
    position: line.position,
    kind: line.kind,
    materialId: line.materialId,
    labourCategoryId: line.labourCategoryId,
    equipmentId: line.equipmentId,
    description: line.description,
    coefficient: fixedDecimal(line.coefficient, COEFFICIENT_SCALE),
    resourceUomId: line.resourceUomId,
    rate: line.rate,
    amount: line.amount,
  }));
}

/** An audit snapshot: money as paise numbers, decimals as text. */
function snapshot(item: ItemSummary, lines?: StoredItemLine[]) {
  return {
    code: item.code,
    shortDescription: item.shortDescription,
    description: item.description,
    uomId: item.uomId,
    sacHsn: item.sacHsn,
    schedule: item.schedule,
    adoptedRate: Number(item.adoptedRate),
    overheadPercent:
      item.overheadPercent == null
        ? null
        : fixedDecimal(item.overheadPercent, PERCENT_SCALE),
    analysedRate: item.analysedRate == null ? null : Number(item.analysedRate),
    ...(lines == null
      ? {}
      : {
          lines: lines.map((line) => ({
            kind: line.kind,
            materialId: line.materialId,
            labourCategoryId: line.labourCategoryId,
            equipmentId: line.equipmentId,
            description: line.description,
            coefficient: fixedDecimal(line.coefficient, COEFFICIENT_SCALE),
            resourceUomId: line.resourceUomId,
            rate: Number(line.rate),
            amount: Number(line.amount),
          })),
        }),
  };
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/** Live Items with one of these codes (any case), other than `exceptId`. */
async function takenCodes(
  tx: Tx,
  workspaceId: string,
  codes: readonly string[],
  exceptId: string | null,
): Promise<{ id: string; code: string }[]> {
  if (codes.length === 0) return [];
  const lower = codes.map((code) => code.toLowerCase());
  return tx.$queryRaw<{ id: string; code: string }[]>(
    Prisma.sql`SELECT id::text AS id, code FROM construction_contracts.items
      WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL
        AND lower(code) = ANY(${lower}::text[])
        AND (${exceptId}::uuid IS NULL OR id <> ${exceptId}::uuid)`,
  );
}

function where(
  filter: ItemFilter,
): Prisma.ConstructionContractsItemWhereInput[] {
  const filters: Prisma.ConstructionContractsItemWhereInput[] = [
    { workspaceId: filter.workspaceId, deletedAt: null },
  ];
  const search = filter.search?.trim() ?? "";
  if (search !== "") {
    const contains = { contains: search, mode: "insensitive" as const };
    filters.push({
      OR: [
        { code: contains },
        { shortDescription: contains },
        { description: contains },
      ],
    });
  }
  const schedule = filter.schedule?.trim() ?? "";
  if (schedule !== "") filters.push({ schedule });
  return filters;
}

/** Items and their analysis lines in `construction_contracts` (CM-1102). */
export class PrismaItemStore implements ItemStore {
  constructor(private readonly db: PrismaClient) {}

  async find(workspaceId: string, id: string): Promise<StoredItem | null> {
    const row = await this.db.constructionContractsItem.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: { analysis: { orderBy: { position: "asc" } } },
    });
    if (row == null) return null;
    const { analysis, ...item } = row;
    return {
      ...toSummary(item, analysis.length),
      lines: analysis.map(toLine),
    };
  }

  async list(params: ItemListParams) {
    const filters = where(params);
    const backwards = params.before != null;
    const cursor = params.after ?? params.before;
    const paged: Prisma.ConstructionContractsItemWhereInput[] =
      cursor == null
        ? filters
        : [
            ...filters,
            {
              OR: backwards
                ? [
                    { code: { lt: cursor.code } },
                    { code: cursor.code, id: { lt: cursor.id } },
                  ]
                : [
                    { code: { gt: cursor.code } },
                    { code: cursor.code, id: { gt: cursor.id } },
                  ],
            },
          ];
    const direction = backwards ? ("desc" as const) : ("asc" as const);
    const [page, total] = await Promise.all([
      this.db.constructionContractsItem.findMany({
        where: { AND: paged },
        include: SUMMARY_INCLUDE,
        orderBy: [{ code: direction }, { id: direction }],
        take: params.limit + 1,
      }),
      this.db.constructionContractsItem.count({ where: { AND: filters } }),
    ]);
    const hasMore = page.length > params.limit;
    const rows = page.slice(0, params.limit);
    if (backwards) rows.reverse();
    return {
      items: rows.map(({ _count, ...row }) => toSummary(row, _count.analysis)),
      total,
      hasMore,
    };
  }

  async all(filter: ItemFilter, limit: number) {
    const filters = where(filter);
    const [rows, total] = await Promise.all([
      this.db.constructionContractsItem.findMany({
        where: { AND: filters },
        include: SUMMARY_INCLUDE,
        orderBy: [{ code: "asc" }, { id: "asc" }],
        take: limit,
      }),
      this.db.constructionContractsItem.count({ where: { AND: filters } }),
    ]);
    return {
      items: rows.map(({ _count, ...row }) => toSummary(row, _count.analysis)),
      total,
    };
  }

  async schedules(workspaceId: string): Promise<string[]> {
    const rows = await this.db.constructionContractsItem.findMany({
      where: { workspaceId, deletedAt: null, schedule: { not: null } },
      distinct: ["schedule"],
      select: { schedule: true },
      orderBy: { schedule: "asc" },
    });
    return rows.flatMap((row) => (row.schedule == null ? [] : [row.schedule]));
  }

  async byCodes(workspaceId: string, codes: readonly string[]) {
    const found = await takenCodes(this.db, workspaceId, codes, null);
    if (found.length === 0) return [];
    const rows = await this.db.constructionContractsItem.findMany({
      where: { workspaceId, id: { in: found.map((row) => row.id) } },
      include: SUMMARY_INCLUDE,
    });
    return rows.map(({ _count, ...row }) => toSummary(row, _count.analysis));
  }

  async insert(item: StoredItem): Promise<void> {
    try {
      await this.db.$transaction(async (tx) => {
        if (
          (await takenCodes(tx, item.workspaceId, [item.code], null)).length > 0
        )
          throw itemCodeTaken(item.code);
        await tx.constructionContractsItem.create({
          data: {
            id: item.id,
            workspaceId: item.workspaceId,
            ...fieldsData(item),
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
            createdBy: item.createdBy,
            updatedBy: item.updatedBy,
          },
        });
        if (item.lines.length > 0)
          await tx.constructionContractsItemAnalysisLine.createMany({
            data: linesData(item),
          });
        await recordAudit(tx, {
          workspaceId: item.workspaceId,
          actorUserId: item.createdBy,
          action: "item.created",
          entityType: "item",
          entityId: item.id,
          after: snapshot(item, item.lines),
          occurredAt: item.createdAt,
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw itemCodeTaken(item.code);
      throw error;
    }
  }

  async update(input: Parameters<ItemStore["update"]>[0]): Promise<void> {
    const { before, after } = input;
    try {
      await this.db.$transaction(async (tx) => {
        const updated = await tx.constructionContractsItem.updateMany({
          where: {
            id: before.id,
            workspaceId: before.workspaceId,
            deletedAt: null,
            updatedAt: input.expectedUpdatedAt,
          },
          data: {
            ...fieldsData(after),
            updatedAt: after.updatedAt,
            updatedBy: after.updatedBy,
          },
        });
        if (updated.count === 0) {
          const live = await tx.constructionContractsItem.count({
            where: { id: before.id, deletedAt: null },
          });
          throw live === 0 ? itemNotFound() : itemChanged();
        }
        if (
          (await takenCodes(tx, before.workspaceId, [after.code], before.id))
            .length > 0
        )
          throw itemCodeTaken(after.code);
        await tx.constructionContractsItemAnalysisLine.deleteMany({
          where: { itemId: before.id },
        });
        if (after.lines.length > 0)
          await tx.constructionContractsItemAnalysisLine.createMany({
            data: linesData(after),
          });
        await recordAudit(tx, {
          workspaceId: before.workspaceId,
          actorUserId: after.updatedBy,
          action: "item.updated",
          entityType: "item",
          entityId: before.id,
          before: snapshot(before, before.lines),
          after: snapshot(after, after.lines),
          occurredAt: after.updatedAt,
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw itemCodeTaken(after.code);
      throw error;
    }
  }

  async delete(input: Parameters<ItemStore["delete"]>[0]): Promise<void> {
    const { item, by, now } = input;
    await this.db.$transaction(async (tx) => {
      // Holds the row so a BOQ cannot copy it while the guard reads.
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM construction_contracts.items
          WHERE id = ${item.id}::uuid FOR UPDATE`,
      );
      const count = await tx.constructionContractsBoqItem.count({
        where: {
          workspaceId: item.workspaceId,
          itemId: item.id,
          deletedAt: null,
        },
      });
      if (count > 0) throw itemInUse(count);
      const deleted = await tx.constructionContractsItem.updateMany({
        where: {
          id: item.id,
          workspaceId: item.workspaceId,
          deletedAt: null,
          ...(input.expectedUpdatedAt == null
            ? {}
            : { updatedAt: input.expectedUpdatedAt }),
        },
        data: { deletedAt: now, deletedBy: by, updatedAt: now, updatedBy: by },
      });
      if (deleted.count === 0) {
        const live = await tx.constructionContractsItem.count({
          where: { id: item.id, deletedAt: null },
        });
        throw live === 0 ? itemNotFound() : itemChanged();
      }
      await recordAudit(tx, {
        workspaceId: item.workspaceId,
        actorUserId: by,
        action: "item.deleted",
        entityType: "item",
        entityId: item.id,
        before: snapshot(item, item.lines),
        occurredAt: now,
      });
    });
  }

  async importRows(input: Parameters<ItemStore["importRows"]>[0]) {
    const { workspaceId, by, now, creates, updates } = input;
    if (creates.length === 0 && updates.length === 0) return;
    try {
      await this.db.$transaction(
        async (tx) => {
          const taken = await takenCodes(
            tx,
            workspaceId,
            creates.map((item) => item.code),
            null,
          );
          if (taken[0] != null) throw itemCodeTaken(taken[0].code);
          if (creates.length > 0)
            await tx.constructionContractsItem.createMany({
              data: creates.map((item) => ({
                id: item.id,
                workspaceId,
                ...fieldsData(item),
                createdAt: now,
                updatedAt: now,
                createdBy: by,
                updatedBy: by,
              })),
            });
          for (const { before, after } of updates) {
            const updated = await tx.constructionContractsItem.updateMany({
              where: { id: before.id, workspaceId, deletedAt: null },
              data: { ...fieldsData(after), updatedAt: now, updatedBy: by },
            });
            if (updated.count === 0) throw itemChanged();
          }
          await tx.constructionOrganizationAuditEvent.createMany({
            data: [
              ...creates.map((item) => ({
                id: newId(now.getTime()),
                workspaceId,
                actorUserId: by,
                action: "item.created",
                entityType: "item",
                entityId: item.id,
                before: Prisma.DbNull,
                after: json({ ...snapshot(item), source: "import" }),
                occurredAt: now,
              })),
              ...updates.map(({ before, after }) => ({
                id: newId(now.getTime()),
                workspaceId,
                actorUserId: by,
                action: "item.updated",
                entityType: "item",
                entityId: before.id,
                before: json(snapshot(before)),
                after: json({ ...snapshot(after), source: "import" }),
                occurredAt: now,
              })),
            ],
          });
        },
        { timeout: 60_000 },
      );
    } catch (error) {
      if (isUniqueViolation(error)) throw itemCodeTaken(creates[0]?.code ?? "");
      throw error;
    }
  }
}

/** Items (CM-1102) over Prisma; the directory comes from the composition root. */
export function createItemHandlers(deps: {
  directory: ContractsDirectory;
  prisma?: PrismaClient;
  clock?: () => Date;
}): ItemHandlers {
  const db = deps.prisma ?? prisma;
  return new ItemHandlers({
    store: new PrismaItemStore(db),
    directory: deps.directory,
    db,
    clock: deps.clock,
  });
}
