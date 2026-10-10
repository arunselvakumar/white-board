import { Prisma, type PrismaClient } from "@repo/construction-db";

import { recordAudit } from "@/src/shared-kernel/audit";
import {
  calendarDateFromDb,
  calendarDateToDb,
} from "@/src/shared-kernel/calendar-date";
import {
  conflict,
  DomainError,
  notFound,
} from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";

import type {
  LeaveStructureStore,
  LeaveTypeChange,
  StoredLeaveAssignment,
  StoredLeaveStructure,
} from "../application/leave-ports";
import type { LeaveStructure } from "../domain/leave-structure";

const INCLUDE = {
  lines: { orderBy: { id: "asc" } },
  _count: { select: { assignments: { where: { deletedAt: null } } } },
} as const satisfies Prisma.ConstructionHrmsLeaveStructureInclude;

type Row = Prisma.ConstructionHrmsLeaveStructureGetPayload<{
  include: typeof INCLUDE;
}>;

const structureChanged = () =>
  conflict(
    "LEAVE_STRUCTURE_CHANGED",
    "Someone else changed this leave structure after you opened it. Reload to see their changes.",
  );

const nameInUse = () =>
  new DomainError(
    "LEAVE_STRUCTURE_NAME_IN_USE",
    "A leave structure with this name already exists.",
    { kind: "conflict", details: { field: "name" } },
  );

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function fromRow(row: Row): StoredLeaveStructure {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isActive: row.isActive,
    lines: row.lines.map((line) => ({
      leaveTypeId: line.leaveTypeId,
      entitlementDays: line.entitlementDays?.toNumber() ?? null,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    assignmentCount: row._count.assignments,
  };
}

function lineRows(structureId: string, structure: LeaveStructure, now: Date) {
  return structure.lines.map((line) => ({
    id: newId(now.getTime()),
    structureId,
    leaveTypeId: line.leaveTypeId,
    entitlementDays: line.entitlementDays?.toFixed(2) ?? null,
  }));
}

/** `leave_structures`, their lines and `leave_structure_assignments` (CM-311). */
export class PrismaLeaveStructureStore implements LeaveStructureStore {
  constructor(private readonly db: PrismaClient) {}

  async list(workspaceId: string): Promise<StoredLeaveStructure[]> {
    const rows = await this.db.constructionHrmsLeaveStructure.findMany({
      where: { workspaceId, deletedAt: null },
      include: INCLUDE,
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    return rows.map(fromRow);
  }

  async find(
    workspaceId: string,
    id: string,
  ): Promise<StoredLeaveStructure | null> {
    const row = await this.db.constructionHrmsLeaveStructure.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: INCLUDE,
    });
    return row == null ? null : fromRow(row);
  }

  async insert(
    workspaceId: string,
    id: string,
    structure: LeaveStructure,
    change: LeaveTypeChange,
  ): Promise<StoredLeaveStructure> {
    try {
      return await this.db.$transaction(async (tx) => {
        await tx.constructionHrmsLeaveStructure.create({
          data: {
            id,
            workspaceId,
            name: structure.name,
            description: structure.description,
            createdAt: change.now,
            updatedAt: change.now,
            createdBy: change.by,
            updatedBy: change.by,
          },
        });
        await tx.constructionHrmsLeaveStructureLine.createMany({
          data: lineRows(id, structure, change.now),
        });
        await recordAudit(tx, {
          workspaceId,
          actorUserId: change.by,
          action: change.action,
          entityType: "leave_structure",
          entityId: id,
          after: structure,
          occurredAt: change.now,
        });
        return fromRow(
          await tx.constructionHrmsLeaveStructure.findUniqueOrThrow({
            where: { id },
            include: INCLUDE,
          }),
        );
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw nameInUse();
      throw error;
    }
  }

  async update(
    workspaceId: string,
    id: string,
    structure: LeaveStructure,
    expectedUpdatedAt: Date,
    change: LeaveTypeChange,
  ): Promise<StoredLeaveStructure> {
    try {
      return await this.db.$transaction(async (tx) => {
        const before = await tx.constructionHrmsLeaveStructure.findFirst({
          where: { id, workspaceId, deletedAt: null },
          include: INCLUDE,
        });
        const updated = await tx.constructionHrmsLeaveStructure.updateMany({
          where: {
            id,
            workspaceId,
            deletedAt: null,
            updatedAt: expectedUpdatedAt,
          },
          data: {
            name: structure.name,
            description: structure.description,
            updatedAt: change.now,
            updatedBy: change.by,
          },
        });
        if (updated.count === 0 || before == null) throw structureChanged();
        await tx.constructionHrmsLeaveStructureLine.deleteMany({
          where: { structureId: id },
        });
        await tx.constructionHrmsLeaveStructureLine.createMany({
          data: lineRows(id, structure, change.now),
        });
        const previous = fromRow(before);
        await recordAudit(tx, {
          workspaceId,
          actorUserId: change.by,
          action: change.action,
          entityType: "leave_structure",
          entityId: id,
          before: {
            name: previous.name,
            description: previous.description,
            lines: previous.lines,
          },
          after: structure,
          occurredAt: change.now,
        });
        return fromRow(
          await tx.constructionHrmsLeaveStructure.findUniqueOrThrow({
            where: { id },
            include: INCLUDE,
          }),
        );
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw nameInUse();
      throw error;
    }
  }

  async delete(
    workspaceId: string,
    id: string,
    expectedUpdatedAt: Date,
    change: LeaveTypeChange,
  ): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id FROM construction_hrms.leave_structures WHERE id = ${id}::uuid FOR UPDATE
      `;
      const assigned = await tx.constructionHrmsLeaveStructureAssignment.count({
        where: { workspaceId, structureId: id, deletedAt: null },
      });
      if (assigned > 0)
        throw conflict(
          "LEAVE_STRUCTURE_IN_USE",
          "Team Members are assigned this structure. Remove their assignments first.",
        );
      const updated = await tx.constructionHrmsLeaveStructure.updateMany({
        where: {
          id,
          workspaceId,
          deletedAt: null,
          updatedAt: expectedUpdatedAt,
        },
        data: {
          deletedAt: change.now,
          deletedBy: change.by,
          updatedAt: change.now,
          updatedBy: change.by,
        },
      });
      if (updated.count === 0) throw structureChanged();
      await recordAudit(tx, {
        workspaceId,
        actorUserId: change.by,
        action: change.action,
        entityType: "leave_structure",
        entityId: id,
        occurredAt: change.now,
      });
    });
  }

  async assignments(
    workspaceId: string,
    filter: { memberIds?: readonly string[]; structureId?: string },
  ): Promise<StoredLeaveAssignment[]> {
    if (filter.memberIds?.length === 0) return [];
    const rows =
      await this.db.constructionHrmsLeaveStructureAssignment.findMany({
        where: {
          workspaceId,
          deletedAt: null,
          structure: { deletedAt: null },
          ...(filter.memberIds == null
            ? {}
            : { memberId: { in: [...filter.memberIds] } }),
          ...(filter.structureId == null
            ? {}
            : { structureId: filter.structureId }),
        },
        orderBy: [{ memberId: "asc" }, { effectiveFrom: "desc" }],
      });
    return rows.map((row) => ({
      id: row.id,
      memberId: row.memberId,
      structureId: row.structureId,
      effectiveFrom: calendarDateFromDb(row.effectiveFrom),
      createdAt: row.createdAt,
    }));
  }

  async assign(
    workspaceId: string,
    rows: readonly StoredLeaveAssignment[],
    change: LeaveTypeChange,
  ): Promise<void> {
    try {
      await this.db.$transaction(async (tx) => {
        const structureIds = [...new Set(rows.map((row) => row.structureId))];
        // Share-lock the structures so a delete waits and then sees these.
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM construction_hrms.leave_structures
          WHERE workspace_id = ${workspaceId}
            AND id = ANY(${structureIds}::uuid[])
            AND deleted_at IS NULL
          FOR SHARE
        `;
        if (locked.length !== structureIds.length)
          throw notFound(
            "LEAVE_STRUCTURE_NOT_FOUND",
            "This leave structure was not found.",
          );
        await tx.constructionHrmsLeaveStructureAssignment.createMany({
          data: rows.map((row) => ({
            id: row.id,
            workspaceId,
            memberId: row.memberId,
            structureId: row.structureId,
            effectiveFrom: calendarDateToDb(row.effectiveFrom),
            createdAt: change.now,
            updatedAt: change.now,
            createdBy: change.by,
            updatedBy: change.by,
          })),
        });
        for (const row of rows)
          await recordAudit(tx, {
            workspaceId,
            actorUserId: change.by,
            action: change.action,
            entityType: "leave_structure_assignment",
            entityId: row.id,
            after: {
              memberId: row.memberId,
              structureId: row.structureId,
              effectiveFrom: row.effectiveFrom,
            },
            occurredAt: change.now,
          });
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new DomainError(
          "LEAVE_ASSIGNMENT_EXISTS",
          "A Team Member already has a structure from this date. Remove it first, or choose another date.",
          { kind: "conflict", details: { field: "effectiveFrom" } },
        );
      throw error;
    }
  }

  async unassign(
    workspaceId: string,
    id: string,
    change: LeaveTypeChange,
  ): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const row = await tx.constructionHrmsLeaveStructureAssignment.findFirst({
        where: { id, workspaceId, deletedAt: null },
      });
      if (row == null)
        throw notFound(
          "LEAVE_ASSIGNMENT_NOT_FOUND",
          "This assignment was not found.",
        );
      const updated =
        await tx.constructionHrmsLeaveStructureAssignment.updateMany({
          where: { id, workspaceId, deletedAt: null },
          data: {
            deletedAt: change.now,
            deletedBy: change.by,
            updatedAt: change.now,
            updatedBy: change.by,
          },
        });
      if (updated.count === 0)
        throw notFound(
          "LEAVE_ASSIGNMENT_NOT_FOUND",
          "This assignment was not found.",
        );
      await recordAudit(tx, {
        workspaceId,
        actorUserId: change.by,
        action: change.action,
        entityType: "leave_structure_assignment",
        entityId: id,
        before: {
          memberId: row.memberId,
          structureId: row.structureId,
          effectiveFrom: calendarDateFromDb(row.effectiveFrom),
        },
        occurredAt: change.now,
      });
    });
  }
}
