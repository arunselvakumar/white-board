import { Prisma, type PrismaClient } from "@repo/construction-db";

import { recordAudit } from "@/src/shared-kernel/audit";
import { conflict, DomainError } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";

import type {
  LeaveTypeChange,
  LeaveTypeStore,
  StoredLeaveType,
} from "../application/leave-ports";
import { createLeaveType, type LeaveType } from "../domain/leave-type";
import seeds from "./seeds/leave-types.json";

type Row = Prisma.ConstructionHrmsLeaveTypeGetPayload<object>;

const typeChanged = () =>
  conflict(
    "LEAVE_TYPE_CHANGED",
    "Someone else changed this leave type after you opened it. Reload to see their changes.",
  );

const nameInUse = () =>
  new DomainError(
    "LEAVE_TYPE_NAME_IN_USE",
    "A leave type with this name already exists.",
    { kind: "conflict", details: { field: "name" } },
  );

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export function leaveTypeFromRow(row: Row): StoredLeaveType {
  return {
    id: row.id,
    name: row.name,
    yearlyLimit: row.yearlyLimit.toNumber(),
    isPaid: row.isPaid,
    requiresApproval: row.requiresApproval,
    approvalLevels:
      row.approvalLevels === 1 || row.approvalLevels === 2
        ? row.approvalLevels
        : null,
    maxConsecutiveDays: row.maxConsecutiveDays,
    carryForward: row.carryForward,
    maxCarryForward: row.maxCarryForward?.toNumber() ?? null,
    accrualMode: row.accrualMode,
    accrualFrequency: row.accrualFrequency,
    accrualDay: row.accrualDay,
    creditPerPeriod: row.creditPerPeriod?.toNumber() ?? null,
    allowAdvanceUse: row.allowAdvanceUse,
    isActive: row.isActive,
    isSeed: row.isSeed,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function columns(type: LeaveType) {
  return {
    name: type.name,
    yearlyLimit: type.yearlyLimit.toFixed(2),
    isPaid: type.isPaid,
    requiresApproval: type.requiresApproval,
    approvalLevels: type.approvalLevels,
    maxConsecutiveDays: type.maxConsecutiveDays,
    carryForward: type.carryForward,
    maxCarryForward: type.maxCarryForward?.toFixed(2) ?? null,
    accrualMode: type.accrualMode,
    accrualFrequency: type.accrualFrequency,
    accrualDay: type.accrualDay,
    creditPerPeriod: type.creditPerPeriod?.toFixed(2) ?? null,
    allowAdvanceUse: type.allowAdvanceUse,
    isActive: type.isActive,
  };
}

function snapshot(type: LeaveType) {
  return { ...type };
}

/** `construction_hrms.leave_types` (CM-310). */
export class PrismaLeaveTypeStore implements LeaveTypeStore {
  constructor(private readonly db: PrismaClient) {}

  async list(workspaceId: string): Promise<StoredLeaveType[]> {
    const rows = await this.db.constructionHrmsLeaveType.findMany({
      where: { workspaceId, deletedAt: null },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    return rows.map(leaveTypeFromRow);
  }

  async find(workspaceId: string, id: string): Promise<StoredLeaveType | null> {
    const row = await this.db.constructionHrmsLeaveType.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    return row == null ? null : leaveTypeFromRow(row);
  }

  async insert(
    workspaceId: string,
    id: string,
    type: LeaveType,
    change: LeaveTypeChange,
  ): Promise<StoredLeaveType> {
    try {
      return await this.db.$transaction(async (tx) => {
        const row = await tx.constructionHrmsLeaveType.create({
          data: {
            id,
            workspaceId,
            ...columns(type),
            createdAt: change.now,
            updatedAt: change.now,
            createdBy: change.by,
            updatedBy: change.by,
          },
        });
        await recordAudit(tx, {
          workspaceId,
          actorUserId: change.by,
          action: change.action,
          entityType: "leave_type",
          entityId: id,
          after: snapshot(type),
          occurredAt: change.now,
        });
        return leaveTypeFromRow(row);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw nameInUse();
      throw error;
    }
  }

  async update(
    workspaceId: string,
    id: string,
    type: LeaveType,
    expectedUpdatedAt: Date,
    change: LeaveTypeChange,
  ): Promise<StoredLeaveType> {
    try {
      return await this.db.$transaction(async (tx) => {
        const before = await tx.constructionHrmsLeaveType.findFirst({
          where: { id, workspaceId, deletedAt: null },
        });
        const updated = await tx.constructionHrmsLeaveType.updateMany({
          where: {
            id,
            workspaceId,
            deletedAt: null,
            updatedAt: expectedUpdatedAt,
          },
          data: {
            ...columns(type),
            updatedAt: change.now,
            updatedBy: change.by,
          },
        });
        if (updated.count === 0 || before == null) throw typeChanged();
        await recordAudit(tx, {
          workspaceId,
          actorUserId: change.by,
          action: change.action,
          entityType: "leave_type",
          entityId: id,
          before: snapshot(leaveTypeFromRow(before)),
          after: snapshot(type),
          occurredAt: change.now,
        });
        return leaveTypeFromRow(
          await tx.constructionHrmsLeaveType.findUniqueOrThrow({
            where: { id },
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
      // Lock the row so a structure line or request written meanwhile is seen.
      await tx.$queryRaw`
        SELECT id FROM construction_hrms.leave_types WHERE id = ${id}::uuid FOR UPDATE
      `;
      if ((await inUse(tx, workspaceId, [id])).has(id))
        throw conflict(
          "LEAVE_TYPE_IN_USE",
          "This leave type is in a structure, a balance or a request. Deactivate it instead.",
        );
      const before = await tx.constructionHrmsLeaveType.findFirst({
        where: { id, workspaceId, deletedAt: null },
      });
      const updated = await tx.constructionHrmsLeaveType.updateMany({
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
      if (updated.count === 0 || before == null) throw typeChanged();
      await recordAudit(tx, {
        workspaceId,
        actorUserId: change.by,
        action: change.action,
        entityType: "leave_type",
        entityId: id,
        before: snapshot(leaveTypeFromRow(before)),
        occurredAt: change.now,
      });
    });
  }

  inUse(workspaceId: string, ids: readonly string[]): Promise<Set<string>> {
    return inUse(this.db, workspaceId, ids);
  }
}

type UsageDb = Pick<
  PrismaClient,
  | "constructionHrmsLeaveStructureLine"
  | "constructionHrmsLeaveLedgerEntry"
  | "constructionHrmsLeaveRequest"
>;

async function inUse(
  db: UsageDb,
  workspaceId: string,
  ids: readonly string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const [lines, entries, requests] = await Promise.all([
    db.constructionHrmsLeaveStructureLine.findMany({
      where: {
        leaveTypeId: { in: [...ids] },
        structure: { workspaceId, deletedAt: null },
      },
      select: { leaveTypeId: true },
      distinct: ["leaveTypeId"],
    }),
    db.constructionHrmsLeaveLedgerEntry.findMany({
      where: { workspaceId, leaveTypeId: { in: [...ids] } },
      select: { leaveTypeId: true },
      distinct: ["leaveTypeId"],
    }),
    db.constructionHrmsLeaveRequest.findMany({
      where: { workspaceId, leaveTypeId: { in: [...ids] } },
      select: { leaveTypeId: true },
      distinct: ["leaveTypeId"],
    }),
  ]);
  return new Set(
    [...lines, ...entries, ...requests].map((row) => row.leaveTypeId),
  );
}

/** The seed leave types, validated like any other (CM-310). */
export function seedLeaveTypes(): LeaveType[] {
  return seeds.leaveTypes.map((seed) => createLeaveType(seed));
}

/**
 * Copies the six seed leave types to a Company (CM-310). Idempotent: names
 * the Company already has (live, any case) are skipped, so running it
 * twice, or after the backfill migration, adds nothing.
 */
export async function seedCompanyLeaveTypes(
  db: PrismaClient,
  input: { workspaceId: string; by: string; now?: Date },
): Promise<number> {
  const now = input.now ?? new Date();
  const existing = await db.constructionHrmsLeaveType.findMany({
    where: { workspaceId: input.workspaceId, deletedAt: null },
    select: { name: true },
  });
  const taken = new Set(existing.map((row) => row.name.toLowerCase()));
  const data = seedLeaveTypes()
    .filter((type) => !taken.has(type.name.toLowerCase()))
    .map((type) => ({
      id: newId(now.getTime()),
      workspaceId: input.workspaceId,
      ...columns(type),
      isSeed: true,
      createdAt: now,
      updatedAt: now,
      createdBy: input.by,
      updatedBy: input.by,
    }));
  if (data.length === 0) return 0;
  const created = await db.constructionHrmsLeaveType.createMany({
    data,
    skipDuplicates: true,
  });
  return created.count;
}
