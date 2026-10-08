import type { Prisma, PrismaClient } from "@repo/db";

import { recordAudit } from "@/src/shared-kernel/audit";

import type { MasterChange, SupervisorStore } from "../application/ports";
import { masterChanged, masterNameInUse } from "../domain/master-kind";
import { Supervisor } from "../domain/supervisor";
import { isUniqueViolation } from "./prisma-lookup-store";

type Row = Prisma.ConstructionMastersSupervisorGetPayload<object>;

function toSupervisor(row: Row): Supervisor {
  return Supervisor.reconstitute({
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    mobile: row.mobile,
    teamMemberId: row.teamMemberId,
    disabledAt: row.disabledAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    deletedAt: row.deletedAt,
    deletedBy: row.deletedBy,
  });
}

function audit(supervisor: Supervisor, change: MasterChange) {
  return {
    workspaceId: supervisor.workspaceId,
    actorUserId: change.by,
    action: change.action,
    entityType: "supervisor",
    entityId: supervisor.id,
    before: change.before,
    after: supervisor.deletedAt == null ? supervisor.snapshot() : null,
    occurredAt: change.now,
  };
}

/** Supervisors in `construction_masters.supervisors` (CM-203). */
export class PrismaSupervisorStore implements SupervisorStore {
  constructor(private readonly db: PrismaClient) {}

  async list(workspaceId: string): Promise<Supervisor[]> {
    const rows = await this.db.constructionMastersSupervisor.findMany({
      where: { workspaceId, deletedAt: null },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    return rows.map(toSupervisor);
  }

  async find(workspaceId: string, id: string): Promise<Supervisor | null> {
    const row = await this.db.constructionMastersSupervisor.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    return row == null ? null : toSupervisor(row);
  }

  async insert(supervisor: Supervisor, change: MasterChange): Promise<void> {
    try {
      await this.db.$transaction(async (tx) => {
        await tx.constructionMastersSupervisor.create({
          data: {
            id: supervisor.id,
            workspaceId: supervisor.workspaceId,
            name: supervisor.name,
            mobile: supervisor.mobile,
            teamMemberId: supervisor.teamMemberId,
            disabledAt: supervisor.disabledAt,
            createdAt: supervisor.createdAt,
            updatedAt: supervisor.updatedAt,
            createdBy: supervisor.createdBy,
            updatedBy: supervisor.updatedBy,
          },
        });
        await recordAudit(tx, audit(supervisor, change));
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw masterNameInUse("supervisor");
      throw error;
    }
  }

  async update(
    supervisor: Supervisor,
    expectedUpdatedAt: Date,
    change: MasterChange,
  ): Promise<void> {
    try {
      await this.db.$transaction(async (tx) => {
        // Compare-and-set on updatedAt: a stale write changes no row.
        const updated = await tx.constructionMastersSupervisor.updateMany({
          where: {
            id: supervisor.id,
            workspaceId: supervisor.workspaceId,
            deletedAt: null,
            updatedAt: expectedUpdatedAt,
          },
          data: {
            name: supervisor.name,
            mobile: supervisor.mobile,
            teamMemberId: supervisor.teamMemberId,
            disabledAt: supervisor.disabledAt,
            updatedAt: supervisor.updatedAt,
            updatedBy: supervisor.updatedBy,
            deletedAt: supervisor.deletedAt,
            deletedBy: supervisor.deletedBy,
          },
        });
        if (updated.count === 0) throw masterChanged("supervisor");
        await recordAudit(tx, audit(supervisor, change));
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw masterNameInUse("supervisor");
      throw error;
    }
  }
}
