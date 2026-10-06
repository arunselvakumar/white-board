import { Prisma, type PrismaClient } from "@repo/db";

import { DomainError } from "../domain/errors";
import type {
  AssignedBatch,
  TeacherAssignmentRepository,
} from "../domain/teacher-assignment-repository";

export class PrismaTeacherAssignmentRepository implements TeacherAssignmentRepository {
  constructor(private readonly db: PrismaClient) {}

  async batchStatus(
    batchId: string,
    workspaceId: string,
  ): Promise<"open" | "closed" | "missing"> {
    const batch = await this.db.trainingInstituteBatch.findFirst({
      where: { id: batchId, workspaceId, deletedAt: null },
      select: { closedAt: true },
    });
    return batch == null
      ? "missing"
      : batch.closedAt == null
        ? "open"
        : "closed";
  }

  async assign(input: {
    teacherId: string;
    batchId: string;
    workspaceId: string;
    userId: string;
  }): Promise<void> {
    try {
      await this.db.trainingInstituteBatchTeacherAssignment.create({
        data: {
          id: crypto.randomUUID(),
          workspaceId: input.workspaceId,
          teacherId: input.teacherId,
          batchId: input.batchId,
          assignedByUserId: input.userId,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new DomainError(
          "TEACHER_ALREADY_ASSIGNED",
          "Teacher is already assigned to this Batch.",
        );
      }
      throw error;
    }
  }

  async unassign(input: {
    teacherId: string;
    batchId: string;
    workspaceId: string;
    userId: string;
  }): Promise<boolean> {
    const result = await this.db.trainingInstituteBatchTeacherAssignment.updateMany({
      where: {
        workspaceId: input.workspaceId,
        teacherId: input.teacherId,
        batchId: input.batchId,
        unassignedAt: null,
        deletedAt: null,
      },
      data: { unassignedAt: new Date(), unassignedByUserId: input.userId },
    });
    return result.count > 0;
  }

  async listActive(
    teacherId: string,
    workspaceId: string,
  ): Promise<AssignedBatch[]> {
    const rows = await this.db.trainingInstituteBatchTeacherAssignment.findMany({
      where: {
        teacherId,
        workspaceId,
        unassignedAt: null,
        deletedAt: null,
        batch: { deletedAt: null },
      },
      include: { batch: true },
      orderBy: [{ assignedAt: "desc" }, { id: "desc" }],
    });
    return rows.map((row) => ({
      id: row.batch.id,
      name: row.batch.name,
      courseId: row.batch.courseId,
      classMode: row.batch.classMode,
      timings: row.batch.timings,
      timezone: row.batch.timezone,
      room: row.batch.room,
      assignedAt: row.assignedAt,
    }));
  }
}
