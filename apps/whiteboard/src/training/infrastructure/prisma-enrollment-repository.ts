import { Prisma, type PrismaClient } from "@repo/db";

import { EnrollmentNotFoundError } from "../application/not-found-error";
import type { BatchId } from "../domain/batch-id";
import type { Enrollment } from "../domain/enrollment";
import type { EnrollmentId } from "../domain/enrollment-id";
import type {
  EnrollmentListParams,
  EnrollmentRepository,
} from "../domain/enrollment-repository";
import { DomainError } from "../domain/errors";
import type { ListPage } from "../domain/list";
import type { StudentId } from "../domain/student-id";
import type { WorkspaceId } from "../domain/workspace-id";
import { toDomainEnrollment } from "./prisma-enrollment-mapper";

export class PrismaEnrollmentRepository implements EnrollmentRepository {
  constructor(private readonly db: PrismaClient) {}

  async save(enrollment: Enrollment): Promise<void> {
    const plan = enrollment.feePlan.toJson();
    const mutable = {
      batchId: enrollment.batchId.value,
      classModeOverride: enrollment.classModeOverride?.value ?? null,
      timingSource: enrollment.timingSource.value,
      studentTimings: enrollment.studentTimings
        ? (enrollment.studentTimings.toJson() as Prisma.InputJsonValue)
        : Prisma.DbNull,
      endedAt: enrollment.endedAt,
      endedByUserId: enrollment.endedByUserId?.value ?? null,
      feePlanType: plan.type,
      feePlanAmountPaise: plan.amountPaise,
      feePlanConcessionPaise: plan.concessionPaise,
      feePlanInstallmentCount: plan.installmentCount,
      feePlanDueDates: plan.dueDates as Prisma.InputJsonValue,
      updatedAt: enrollment.updatedAt,
      deletedAt: enrollment.deletedAt,
      deletedByUserId: enrollment.deletedByUserId?.value ?? null,
    };

    const updated = await this.db.enrollment.updateMany({
      where: { id: enrollment.id.value, deletedAt: null },
      data: mutable,
    });
    if (updated.count > 0) {
      return;
    }
    if (enrollment.deletedAt != null) {
      throw new EnrollmentNotFoundError();
    }
    try {
      await this.db.enrollment.create({
        data: {
          id: enrollment.id.value,
          workspaceId: enrollment.workspaceId.value,
          studentId: enrollment.studentId.value,
          courseId: enrollment.courseId.value,
          createdByUserId: enrollment.createdByUserId.value,
          createdAt: enrollment.createdAt,
          ...mutable,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new DomainError(
          "STUDENT_ALREADY_ENROLLED",
          "This Student is already in that Batch.",
        );
      }
      throw error;
    }
  }

  async findActiveByStudentAndBatch(
    studentId: StudentId,
    batchId: BatchId,
    workspaceId: WorkspaceId,
  ): Promise<Enrollment | null> {
    const row = await this.db.enrollment.findFirst({
      where: {
        studentId: studentId.value,
        batchId: batchId.value,
        workspaceId: workspaceId.value,
        deletedAt: null,
        endedAt: null,
      },
    });
    return row == null ? null : toDomainEnrollment(row);
  }

  async findByIdInWorkspace(
    id: EnrollmentId,
    workspaceId: WorkspaceId,
  ): Promise<Enrollment | null> {
    const row = await this.db.enrollment.findFirst({
      where: {
        id: id.value,
        workspaceId: workspaceId.value,
        deletedAt: null,
      },
    });
    return row == null ? null : toDomainEnrollment(row);
  }

  async listInWorkspace(
    params: EnrollmentListParams,
  ): Promise<ListPage<Enrollment>> {
    const cursor = cursorWhere(params);
    const where: Prisma.EnrollmentWhereInput = {
      workspaceId: params.workspaceId.value,
      deletedAt: null,
      ...(params.studentId != null ? { studentId: params.studentId.value } : {}),
      ...(params.batchId != null ? { batchId: params.batchId.value } : {}),
      ...cursor,
    };
    const orderBy = listOrderBy(params.before != null);
    const countWhere: Prisma.EnrollmentWhereInput = {
      workspaceId: params.workspaceId.value,
      deletedAt: null,
      ...(params.studentId != null ? { studentId: params.studentId.value } : {}),
      ...(params.batchId != null ? { batchId: params.batchId.value } : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.enrollment.findMany({
        where,
        orderBy,
        take: params.limit + 1,
      }),
      this.db.enrollment.count({ where: countWhere }),
    ]);
    const hasMore = rows.length > params.limit;
    const pageRows = hasMore ? rows.slice(0, params.limit) : rows;
    const inDisplayOrder =
      params.before != null ? [...pageRows].reverse() : pageRows;
    return {
      items: inDisplayOrder.map(toDomainEnrollment),
      total,
      hasMore,
    };
  }

  async countActiveInBatch(
    batchId: BatchId,
    workspaceId: WorkspaceId,
  ): Promise<number> {
    return this.db.enrollment.count({
      where: {
        batchId: batchId.value,
        workspaceId: workspaceId.value,
        deletedAt: null,
        endedAt: null,
      },
    });
  }

  async countActiveByBatchIds(
    batchIds: BatchId[],
    workspaceId: WorkspaceId,
  ): Promise<Map<string, number>> {
    if (batchIds.length === 0) {
      return new Map();
    }
    const rows = await this.db.enrollment.groupBy({
      by: ["batchId"],
      where: {
        workspaceId: workspaceId.value,
        batchId: { in: batchIds.map((id) => id.value) },
        deletedAt: null,
        endedAt: null,
      },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.batchId, row._count._all]));
  }
}

function cursorWhere(
  params: EnrollmentListParams,
): Pick<Prisma.EnrollmentWhereInput, "OR"> | Record<string, never> {
  if (params.after != null) {
    return {
      OR: [
        { createdAt: { lt: params.after.createdAt } },
        {
          createdAt: params.after.createdAt,
          id: { lt: params.after.id.value },
        },
      ],
    };
  }
  if (params.before != null) {
    return {
      OR: [
        { createdAt: { gt: params.before.createdAt } },
        {
          createdAt: params.before.createdAt,
          id: { gt: params.before.id.value },
        },
      ],
    };
  }
  return {};
}

function listOrderBy(
  ascending: boolean,
): Prisma.EnrollmentOrderByWithRelationInput[] {
  const direction = ascending ? "asc" : "desc";
  return [{ createdAt: direction }, { id: direction }];
}
