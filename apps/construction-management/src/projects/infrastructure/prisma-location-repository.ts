import { Prisma, type PrismaClient } from "@repo/construction-db";

import { recordAudit, type AuditEvent } from "@/src/shared-kernel/audit";
import { conflict } from "@/src/shared-kernel/domain-error";

import { Location, locationNotFound } from "../domain/location";
import type { LocationRepository } from "../domain/structure-repository";
import { isUniqueViolation } from "./prisma-phase-repository";

type Row = Prisma.ConstructionProjectsLocationGetPayload<object>;

type Tx = Prisma.TransactionClient;

function toLocation(row: Row): Location {
  return Location.reconstitute({
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    name: row.name,
    description: row.description,
    position: row.position,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    deletedAt: row.deletedAt,
  });
}

function nameInUse() {
  return conflict(
    "LOCATION_NAME_IN_USE",
    "A Location with this name already exists on this Project.",
  );
}

function changed() {
  return conflict(
    "LOCATION_CHANGED",
    "Someone else changed this Location after you opened it. Reload to see their changes.",
  );
}

/** Compare-and-set on `updatedAt`; false when the row changed or went. */
async function write(
  tx: Tx,
  location: Location,
  expectedUpdatedAt: Date,
  data: Prisma.ConstructionProjectsLocationUpdateManyMutationInput,
): Promise<boolean> {
  const written = await tx.constructionProjectsLocation.updateMany({
    where: {
      id: location.id,
      workspaceId: location.workspaceId,
      deletedAt: null,
      updatedAt: expectedUpdatedAt,
    },
    data: {
      ...data,
      updatedAt: location.updatedAt,
      updatedBy: location.updatedBy,
    },
  });
  return written.count > 0;
}

/** `construction_projects.locations`; names unique among a Project's live rows. */
export class PrismaLocationRepository implements LocationRepository {
  constructor(private readonly db: PrismaClient) {}

  async list(workspaceId: string, projectId: string): Promise<Location[]> {
    const rows = await this.db.constructionProjectsLocation.findMany({
      where: { workspaceId, projectId, deletedAt: null },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map(toLocation);
  }

  async find(
    workspaceId: string,
    projectId: string,
    id: string,
  ): Promise<Location | null> {
    const row = await this.db.constructionProjectsLocation.findFirst({
      where: { id, workspaceId, projectId, deletedAt: null },
    });
    return row == null ? null : toLocation(row);
  }

  async insert(location: Location, audit: AuditEvent): Promise<void> {
    try {
      await this.db.$transaction(async (tx) => {
        await tx.constructionProjectsLocation.create({
          data: {
            id: location.id,
            workspaceId: location.workspaceId,
            projectId: location.projectId,
            name: location.name,
            description: location.description,
            position: location.position,
            createdAt: location.createdAt,
            updatedAt: location.updatedAt,
            createdBy: location.createdBy,
            updatedBy: location.updatedBy,
          },
        });
        await recordAudit(tx, audit);
      });
    } catch (error) {
      throw isUniqueViolation(error) ? nameInUse() : error;
    }
  }

  async update(
    location: Location,
    expectedUpdatedAt: Date,
    audit: AuditEvent,
  ): Promise<void> {
    try {
      await this.db.$transaction(async (tx) => {
        const ok = await write(tx, location, expectedUpdatedAt, {
          name: location.name,
          description: location.description,
        });
        if (!ok) throw changed();
        await recordAudit(tx, audit);
      });
    } catch (error) {
      throw isUniqueViolation(error) ? nameInUse() : error;
    }
  }

  async swap(
    moved: { location: Location; expectedUpdatedAt: Date },
    other: { location: Location; expectedUpdatedAt: Date },
    audit: AuditEvent,
  ): Promise<void> {
    await this.db.$transaction(async (tx) => {
      for (const side of [moved, other]) {
        const ok = await write(tx, side.location, side.expectedUpdatedAt, {
          position: side.location.position,
        });
        if (!ok) throw changed();
      }
      await recordAudit(tx, audit);
    });
  }

  async delete(location: Location, audit: AuditEvent): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const deleted = await tx.constructionProjectsLocation.updateMany({
        where: {
          id: location.id,
          workspaceId: location.workspaceId,
          deletedAt: null,
        },
        data: {
          deletedAt: location.deletedAt,
          deletedBy: location.updatedBy,
          updatedAt: location.updatedAt,
          updatedBy: location.updatedBy,
        },
      });
      if (deleted.count === 0) throw locationNotFound();
      await recordAudit(tx, audit);
    });
  }
}
