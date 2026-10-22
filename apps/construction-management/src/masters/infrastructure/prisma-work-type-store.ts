import type { Prisma, PrismaClient } from "@repo/construction-db";

import { recordAudit } from "@/src/shared-kernel/audit";
import { isUniqueViolation } from "@/src/shared-kernel/prisma-errors";

import type { MasterChange } from "../application/ports";
import type {
  WorkTypePick,
  WorkTypeRow,
  WorkTypeStore,
} from "../application/work-type-ports";
import { masterChanged, masterNameInUse } from "../domain/master-kind";
import { WorkType } from "../domain/work-type";

const INCLUDE = {
  department: { select: { name: true, disabledAt: true } },
  materials: {
    select: {
      material: {
        select: {
          id: true,
          name: true,
          disabledAt: true,
          deletedAt: true,
          uom: { select: { name: true } },
        },
      },
    },
  },
} as const;

type Row = Prisma.ConstructionMastersWorkTypeGetPayload<{
  include: typeof INCLUDE;
}>;

const byName = new Intl.Collator("en", { sensitivity: "base", numeric: true });

function toRow(row: Row): WorkTypeRow {
  const live = row.materials
    .map((link) => link.material)
    .filter((material) => material.deletedAt == null)
    .sort((a, b) => byName.compare(a.name, b.name));
  return {
    workType: WorkType.reconstitute({
      id: row.id,
      workspaceId: row.workspaceId,
      name: row.name,
      departmentId: row.departmentId,
      materialIds: live.map((material) => material.id),
      isSeed: row.isSeed,
      disabledAt: row.disabledAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
      deletedAt: row.deletedAt,
      deletedBy: row.deletedBy,
    }),
    departmentName: row.department.name,
    departmentDisabled: row.department.disabledAt != null,
    materials: live.map((material) => ({
      id: material.id,
      name: material.name,
      unitName: material.uom.name,
      disabled: material.disabledAt != null,
    })),
  };
}

function audit(workType: WorkType, change: MasterChange) {
  return {
    workspaceId: workType.workspaceId,
    actorUserId: change.by,
    action: change.action,
    entityType: "work_type",
    entityId: workType.id,
    before: change.before,
    after: workType.deletedAt == null ? workType.snapshot() : null,
    occurredAt: change.now,
  };
}

function links(workType: WorkType) {
  return workType.materialIds.map((materialId) => ({
    workTypeId: workType.id,
    materialId,
  }));
}

/** Work Types and their Materials in `construction_masters` (CM-601). */
export class PrismaWorkTypeStore implements WorkTypeStore {
  constructor(private readonly db: PrismaClient) {}

  async list(workspaceId: string): Promise<WorkTypeRow[]> {
    const rows = await this.db.constructionMastersWorkType.findMany({
      where: { workspaceId, deletedAt: null },
      include: INCLUDE,
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    return rows.map(toRow);
  }

  async find(workspaceId: string, id: string): Promise<WorkTypeRow | null> {
    const row = await this.db.constructionMastersWorkType.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: INCLUDE,
    });
    return row == null ? null : toRow(row);
  }

  async insert(workType: WorkType, change: MasterChange): Promise<void> {
    try {
      await this.db.$transaction(async (tx) => {
        await tx.constructionMastersWorkType.create({
          data: {
            id: workType.id,
            workspaceId: workType.workspaceId,
            name: workType.name,
            departmentId: workType.departmentId,
            isSeed: workType.isSeed,
            disabledAt: workType.disabledAt,
            createdAt: workType.createdAt,
            updatedAt: workType.updatedAt,
            createdBy: workType.createdBy,
            updatedBy: workType.updatedBy,
          },
        });
        if (workType.materialIds.length > 0)
          await tx.constructionMastersWorkTypeMaterial.createMany({
            data: links(workType),
          });
        await recordAudit(tx, audit(workType, change));
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw masterNameInUse("work_type");
      throw error;
    }
  }

  async update(
    workType: WorkType,
    expectedUpdatedAt: Date,
    change: MasterChange,
  ): Promise<void> {
    try {
      await this.db.$transaction(async (tx) => {
        // Compare-and-set on updatedAt: a stale write changes no row.
        const updated = await tx.constructionMastersWorkType.updateMany({
          where: {
            id: workType.id,
            workspaceId: workType.workspaceId,
            deletedAt: null,
            updatedAt: expectedUpdatedAt,
          },
          data: {
            name: workType.name,
            departmentId: workType.departmentId,
            disabledAt: workType.disabledAt,
            updatedAt: workType.updatedAt,
            updatedBy: workType.updatedBy,
            deletedAt: workType.deletedAt,
            deletedBy: workType.deletedBy,
          },
        });
        if (updated.count === 0) throw masterChanged("work_type");
        if (workType.deletedAt == null) {
          // Links to deleted Materials go too; they were not shown.
          await tx.constructionMastersWorkTypeMaterial.deleteMany({
            where: { workTypeId: workType.id },
          });
          if (workType.materialIds.length > 0)
            await tx.constructionMastersWorkTypeMaterial.createMany({
              data: links(workType),
            });
        }
        await recordAudit(tx, audit(workType, change));
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw masterNameInUse("work_type");
      throw error;
    }
  }

  async department(
    workspaceId: string,
    id: string,
  ): Promise<WorkTypePick | null> {
    const row = await this.db.constructionMastersDepartment.findFirst({
      where: { id, workspaceId, deletedAt: null },
      select: { id: true, name: true, disabledAt: true },
    });
    return row == null
      ? null
      : { id: row.id, name: row.name, disabled: row.disabledAt != null };
  }

  async materials(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<WorkTypePick[]> {
    const rows = await this.db.constructionMastersMaterial.findMany({
      where: { id: { in: [...ids] }, workspaceId, deletedAt: null },
      select: { id: true, name: true, disabledAt: true },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      disabled: row.disabledAt != null,
    }));
  }
}
