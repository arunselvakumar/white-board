import { Prisma, type PrismaClient } from "@repo/construction-db";

import { recordAudit } from "@/src/shared-kernel/audit";
import {
  conflict,
  DomainError,
  notFound,
} from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";
import type { ListCursor } from "@/src/shared-kernel/list-cursor";

import type { ProcurementDirectory } from "../application/ports";
import type {
  ProcurementCommandActor,
  StoreListPage,
  StoreListParams,
  StoreOption,
  StoreReadModel,
  StoreRepository,
  StoreStockRow,
} from "../application/store-handlers";
import { assertStoreDeletable, type StoreDraft } from "../domain/store";
import type { PrismaCentralInventory } from "./central-inventory-reader";

type Tx = Prisma.TransactionClient;
type Db = PrismaClient | Tx;

const include = {
  projects: { select: { projectId: true } },
  keepers: { select: { teamMemberId: true } },
  suppliers: { select: { supplierId: true } },
} as const;

type Row = Prisma.ConstructionProcurementStoreGetPayload<{
  include: typeof include;
}>;

export function storeNotFound(): DomainError {
  return notFound("STORE_NOT_FOUND", "This store was not found.");
}

/** Newest first; `after` pages forward (older), `before` back. */
export function cursorWhere(
  cursor: ListCursor | undefined,
  backwards: boolean,
): { OR: object[] } | undefined {
  if (cursor == null) return undefined;
  return {
    OR: backwards
      ? [
          { createdAt: { gt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { gt: cursor.id } },
        ]
      : [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
  };
}

export function cursorOrder(backwards: boolean) {
  return backwards
    ? [{ createdAt: "asc" as const }, { id: "asc" as const }]
    : [{ createdAt: "desc" as const }, { id: "desc" as const }];
}

function snapshot(draft: StoreDraft) {
  return { ...draft };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function nameTaken(): DomainError {
  return conflict("STORE_NAME_TAKEN", "Another store already has this name.", {
    field: "name",
  });
}

/** Central Stores in `construction_procurement.stores` (CM-508). */
export class PrismaStoreRepository implements StoreRepository {
  constructor(
    private readonly db: PrismaClient,
    private readonly directory: ProcurementDirectory,
    private readonly inventory: PrismaCentralInventory,
  ) {}

  async list(params: StoreListParams): Promise<StoreListPage> {
    const where: Prisma.ConstructionProcurementStoreWhereInput = {
      workspaceId: params.workspaceId,
      deletedAt: null,
    };
    const search = params.search?.trim() ?? "";
    if (search !== "") where.name = { contains: search, mode: "insensitive" };
    if (params.projectId != null)
      where.projects = { some: { projectId: params.projectId } };
    const backwards = params.before != null;
    const cursor = cursorWhere(params.after ?? params.before, backwards);
    const [page, total] = await Promise.all([
      this.db.constructionProcurementStore.findMany({
        where: cursor == null ? where : { AND: [where, cursor] },
        include,
        orderBy: cursorOrder(backwards),
        take: params.limit + 1,
      }),
      this.db.constructionProcurementStore.count({ where }),
    ]);
    const hasMore = page.length > params.limit;
    const rows = page.slice(0, params.limit);
    if (backwards) rows.reverse();
    return {
      items: await this.readModels(this.db, params.workspaceId, rows),
      hasMore,
      total,
    };
  }

  async find(workspaceId: string, id: string): Promise<StoreReadModel | null> {
    const row = await this.db.constructionProcurementStore.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include,
    });
    if (row == null) return null;
    const [model] = await this.readModels(this.db, workspaceId, [row]);
    return model ?? null;
  }

  async create(
    actor: ProcurementCommandActor,
    draft: StoreDraft,
  ): Promise<StoreReadModel> {
    const id = newId();
    const now = new Date();
    try {
      return await this.db.$transaction(async (tx) => {
        await this.assertParties(tx, actor.workspaceId, draft, null);
        await this.assertNameFree(tx, actor.workspaceId, draft.name, null);
        await tx.constructionProcurementStore.create({
          data: {
            id,
            workspaceId: actor.workspaceId,
            name: draft.name,
            address: draft.address,
            stateCode: draft.stateCode,
            createdAt: now,
            updatedAt: now,
            createdBy: actor.userId,
            updatedBy: actor.userId,
            projects: {
              create: draft.projectIds.map((projectId) => ({ projectId })),
            },
            keepers: {
              create: draft.keeperIds.map((teamMemberId) => ({ teamMemberId })),
            },
            suppliers: {
              create: draft.supplierIds.map((supplierId) => ({ supplierId })),
            },
          },
        });
        await recordAudit(tx, {
          workspaceId: actor.workspaceId,
          actorUserId: actor.userId,
          action: "store.created",
          entityType: "store",
          entityId: id,
          after: snapshot(draft),
          occurredAt: now,
        });
        return this.load(tx, actor.workspaceId, id);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw nameTaken();
      throw error;
    }
  }

  async update(
    actor: ProcurementCommandActor,
    id: string,
    draft: StoreDraft,
    expectedUpdatedAt: Date,
  ): Promise<StoreReadModel> {
    const now = new Date();
    try {
      return await this.db.$transaction(async (tx) => {
        const before = await this.lock(tx, actor.workspaceId, id);
        if (before.updatedAt.getTime() !== expectedUpdatedAt.getTime())
          throw conflict(
            "STORE_CHANGED",
            "Someone changed this store after you opened it. Reload to see the latest.",
          );
        await this.assertParties(tx, actor.workspaceId, draft, before);
        await this.assertNameFree(tx, actor.workspaceId, draft.name, id);
        const removed = before.projects
          .map((row) => row.projectId)
          .filter((projectId) => !draft.projectIds.includes(projectId));
        if (removed.length > 0) {
          const open = await tx.constructionProcurementMaterialRequest.count({
            where: {
              workspaceId: actor.workspaceId,
              storeId: id,
              projectId: { in: removed },
              deletedAt: null,
              status: { in: ["requested", "partially_delivered"] },
            },
          });
          if (open > 0)
            throw conflict(
              "STORE_PROJECT_IN_USE",
              "A Project you removed still has open Material Requests to this store. Close or deliver them first.",
              { field: "projectIds" },
            );
        }
        await tx.constructionProcurementStoreProject.deleteMany({
          where: { storeId: id },
        });
        await tx.constructionProcurementStoreKeeper.deleteMany({
          where: { storeId: id },
        });
        await tx.constructionProcurementStoreSupplier.deleteMany({
          where: { storeId: id },
        });
        await tx.constructionProcurementStore.update({
          where: { id },
          data: {
            name: draft.name,
            address: draft.address,
            stateCode: draft.stateCode,
            updatedAt: now,
            updatedBy: actor.userId,
            projects: {
              create: draft.projectIds.map((projectId) => ({ projectId })),
            },
            keepers: {
              create: draft.keeperIds.map((teamMemberId) => ({ teamMemberId })),
            },
            suppliers: {
              create: draft.supplierIds.map((supplierId) => ({ supplierId })),
            },
          },
        });
        await recordAudit(tx, {
          workspaceId: actor.workspaceId,
          actorUserId: actor.userId,
          action: "store.updated",
          entityType: "store",
          entityId: id,
          before: draftOf(before),
          after: snapshot(draft),
          occurredAt: now,
        });
        return this.load(tx, actor.workspaceId, id);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw nameTaken();
      throw error;
    }
  }

  async delete(
    actor: ProcurementCommandActor,
    id: string,
    expectedUpdatedAt: Date,
  ): Promise<void> {
    const now = new Date();
    await this.db.$transaction(async (tx) => {
      const before = await this.lock(tx, actor.workspaceId, id);
      if (before.updatedAt.getTime() !== expectedUpdatedAt.getTime())
        throw conflict(
          "STORE_CHANGED",
          "Someone changed this store after you opened it. Reload to see the latest.",
        );
      const [stock] = await tx.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) AS count FROM (
          SELECT material_id FROM "construction_procurement"."stock_entries"
          WHERE workspace_id = ${actor.workspaceId}
            AND location_kind = 'store' AND location_id = ${id}::uuid
          GROUP BY material_id HAVING SUM(quantity) <> 0
        ) held`;
      const [openRequests, notes, transfers] = await Promise.all([
        tx.constructionProcurementMaterialRequest.count({
          where: {
            workspaceId: actor.workspaceId,
            storeId: id,
            deletedAt: null,
            status: { in: ["requested", "partially_delivered"] },
          },
        }),
        tx.constructionProcurementDeliveryNote.count({
          where: {
            workspaceId: actor.workspaceId,
            storeId: id,
            deletedAt: null,
            deliveredAt: null,
          },
        }),
        tx.constructionProcurementMaterialTransfer.count({
          where: {
            workspaceId: actor.workspaceId,
            deletedAt: null,
            deliveredAt: null,
            approvalStatus: { in: ["pending", "approved"] },
            OR: [
              { fromKind: "store", fromId: id },
              { toKind: "store", toId: id },
            ],
          },
        }),
      ]);
      assertStoreDeletable({
        materialsInStock: Number(stock?.count ?? 0n),
        openMaterialRequests: openRequests,
        undeliveredDeliveryNotes: notes,
        undeliveredTransfers: transfers,
      });
      await tx.constructionProcurementStore.update({
        where: { id },
        data: {
          deletedAt: now,
          deletedBy: actor.userId,
          updatedAt: now,
          updatedBy: actor.userId,
        },
      });
      await recordAudit(tx, {
        workspaceId: actor.workspaceId,
        actorUserId: actor.userId,
        action: "store.deleted",
        entityType: "store",
        entityId: id,
        before: draftOf(before),
        occurredAt: now,
      });
    });
  }

  async stock(workspaceId: string, storeId: string): Promise<StoreStockRow[]> {
    const { materials } = await this.inventory.inventory({
      workspaceId,
      locations: [{ kind: "store", id: storeId }],
    });
    return materials.flatMap((material) =>
      material.positions.map((position) => ({
        materialId: material.materialId,
        materialName: material.materialName,
        uomName: material.uomName,
        categoryId: material.categoryId,
        categoryName: material.categoryName,
        stock: position.stock,
        inTransit: position.inTransit,
        minimum: position.minimum,
        state: position.state,
      })),
    );
  }

  async options(
    workspaceId: string,
    projectId?: string,
  ): Promise<StoreOption[]> {
    return this.db.constructionProcurementStore.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        ...(projectId == null ? {} : { projects: { some: { projectId } } }),
      },
      select: { id: true, name: true, stateCode: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
  }

  /** The live store row, locked for the rest of the transaction; 404 otherwise. */
  private async lock(tx: Tx, workspaceId: string, id: string): Promise<Row> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id::text FROM "construction_procurement"."stores"
      WHERE id = ${id}::uuid AND workspace_id = ${workspaceId} AND deleted_at IS NULL
      FOR UPDATE`;
    if (locked.length === 0) throw storeNotFound();
    const row = await tx.constructionProcurementStore.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include,
    });
    if (row == null) throw storeNotFound();
    return row;
  }

  private async assertNameFree(
    tx: Tx,
    workspaceId: string,
    name: string,
    exceptId: string | null,
  ): Promise<void> {
    const clash = await tx.constructionProcurementStore.findFirst({
      where: {
        workspaceId,
        deletedAt: null,
        name: { equals: name, mode: "insensitive" },
        ...(exceptId == null ? {} : { id: { not: exceptId } }),
      },
      select: { id: true },
    });
    if (clash != null) throw nameTaken();
  }

  /**
   * Every Project and store keeper must be the Company's live row; a
   * Supplier added must be active (one kept from before may have been
   * deactivated since).
   */
  private async assertParties(
    tx: Tx,
    workspaceId: string,
    draft: StoreDraft,
    before: Row | null,
  ): Promise<void> {
    const [projects, keepers, suppliers] = await Promise.all([
      this.directory.projects(tx, workspaceId, draft.projectIds),
      this.directory.teamMembers(tx, workspaceId, draft.keeperIds),
      this.directory.suppliers(tx, workspaceId, draft.supplierIds),
    ]);
    const missingProject = draft.projectIds.find((id) => !projects.has(id));
    if (missingProject != null)
      throw new DomainError(
        "PROJECT_NOT_FOUND",
        "This Project was not found.",
        {
          details: { field: "projectIds", ids: [missingProject] },
        },
      );
    const missingKeeper = draft.keeperIds.find((id) => !keepers.has(id));
    if (missingKeeper != null)
      throw new DomainError(
        "TEAM_MEMBER_NOT_FOUND",
        "This Team Member was not found.",
        { details: { field: "keeperIds", ids: [missingKeeper] } },
      );
    const kept = new Set(before?.suppliers.map((row) => row.supplierId) ?? []);
    for (const id of draft.supplierIds) {
      const supplier = suppliers.get(id);
      if (supplier == null)
        throw new DomainError(
          "SUPPLIER_NOT_FOUND",
          "This Supplier was not found.",
          {
            details: { field: "supplierIds", ids: [id] },
          },
        );
      if (!supplier.isActive && !kept.has(id))
        throw new DomainError(
          "SUPPLIER_INACTIVE",
          `${supplier.name} is inactive. Activate it in Masters first.`,
          { details: { field: "supplierIds", ids: [id] } },
        );
    }
  }

  private async load(tx: Tx, workspaceId: string, id: string) {
    const row = await tx.constructionProcurementStore.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include,
    });
    if (row == null) throw storeNotFound();
    const [model] = await this.readModels(tx, workspaceId, [row]);
    if (model == null) throw storeNotFound();
    return model;
  }

  private async readModels(
    db: Db,
    workspaceId: string,
    rows: readonly Row[],
  ): Promise<StoreReadModel[]> {
    const projectIds = rows.flatMap((row) =>
      row.projects.map((p) => p.projectId),
    );
    const keeperIds = rows.flatMap((row) =>
      row.keepers.map((k) => k.teamMemberId),
    );
    const supplierIds = rows.flatMap((row) =>
      row.suppliers.map((s) => s.supplierId),
    );
    const tx = db;
    const [projects, keepers, suppliers] = await Promise.all([
      this.directory.projects(tx, workspaceId, [...new Set(projectIds)]),
      this.directory.teamMembers(tx, workspaceId, [...new Set(keeperIds)]),
      this.directory.suppliers(tx, workspaceId, [...new Set(supplierIds)]),
    ]);
    const named = <T extends { name: string }>(
      ids: readonly string[],
      map: ReadonlyMap<string, T>,
    ) =>
      ids
        .flatMap((id) => {
          const found = map.get(id);
          return found == null ? [] : [{ id, name: found.name }];
        })
        .sort((a, b) => a.name.localeCompare(b.name, "en-IN"));
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      address: row.address,
      stateCode: row.stateCode,
      projects: named(
        row.projects.map((p) => p.projectId),
        projects,
      ),
      keepers: named(
        row.keepers.map((k) => k.teamMemberId),
        keepers,
      ),
      suppliers: named(
        row.suppliers.map((s) => s.supplierId),
        suppliers,
      ),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }
}

function draftOf(row: Row): StoreDraft {
  return {
    name: row.name,
    address: row.address,
    stateCode: row.stateCode,
    projectIds: row.projects.map((p) => p.projectId),
    keeperIds: row.keepers.map((k) => k.teamMemberId),
    supplierIds: row.suppliers.map((s) => s.supplierId),
  };
}
