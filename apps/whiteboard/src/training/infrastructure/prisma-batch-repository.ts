import { Prisma, type PrismaClient } from "@repo/db";

import { BatchNotFoundError } from "../application/not-found-error";
import type { Batch } from "../domain/batch";
import type { BatchId } from "../domain/batch-id";
import type {
  BatchListParams,
  BatchRepository,
} from "../domain/batch-repository";
import type { ListPage } from "../domain/list";
import type { WorkspaceId } from "../domain/workspace-id";
import { toDomainBatch } from "./prisma-batch-mapper";

export class PrismaBatchRepository implements BatchRepository {
  constructor(private readonly db: PrismaClient) {}

  async save(batch: Batch): Promise<void> {
    const mutable = {
      name: batch.name.value,
      classMode: batch.classMode.value,
      capacity: batch.capacity.value,
      room: batch.room?.value ?? null,
      joinUrl: batch.joinUrl?.value ?? null,
      meetingOption: batch.meetingOption,
      timings: batch.timings.toJson() as Prisma.InputJsonValue,
      timezone: batch.timezone,
      closedAt: batch.closedAt,
      closedByUserId: batch.closedByUserId?.value ?? null,
      updatedAt: batch.updatedAt,
      deletedAt: batch.deletedAt,
      deletedByUserId: batch.deletedByUserId?.value ?? null,
    };

    const updated = await this.db.batch.updateMany({
      where: { id: batch.id.value, deletedAt: null },
      data: mutable,
    });
    if (updated.count > 0) {
      return;
    }
    if (batch.deletedAt != null) {
      throw new BatchNotFoundError();
    }
    try {
      await this.db.batch.create({
        data: {
          id: batch.id.value,
          workspaceId: batch.workspaceId.value,
          courseId: batch.courseId.value,
          createdByUserId: batch.createdByUserId.value,
          createdAt: batch.createdAt,
          ...mutable,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new BatchNotFoundError();
      }
      throw error;
    }
  }

  async findByIdInWorkspace(
    id: BatchId,
    workspaceId: WorkspaceId,
  ): Promise<Batch | null> {
    const row = await this.db.batch.findFirst({
      where: {
        id: id.value,
        workspaceId: workspaceId.value,
        deletedAt: null,
      },
    });
    return row == null ? null : toDomainBatch(row);
  }

  async listInWorkspace(params: BatchListParams): Promise<ListPage<Batch>> {
    const cursor = cursorWhere(params);
    const where: Prisma.BatchWhereInput = {
      workspaceId: params.workspaceId.value,
      deletedAt: null,
      ...(params.courseId != null ? { courseId: params.courseId.value } : {}),
      ...cursor,
    };
    const orderBy = listOrderBy(params.before != null);
    const countWhere: Prisma.BatchWhereInput = {
      workspaceId: params.workspaceId.value,
      deletedAt: null,
      ...(params.courseId != null ? { courseId: params.courseId.value } : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.batch.findMany({
        where,
        orderBy,
        take: params.limit + 1,
      }),
      this.db.batch.count({ where: countWhere }),
    ]);
    const hasMore = rows.length > params.limit;
    const pageRows = hasMore ? rows.slice(0, params.limit) : rows;
    const inDisplayOrder =
      params.before != null ? [...pageRows].reverse() : pageRows;
    return {
      items: inDisplayOrder.map(toDomainBatch),
      total,
      hasMore,
    };
  }
}

function cursorWhere(
  params: BatchListParams,
): Pick<Prisma.BatchWhereInput, "OR"> | Record<string, never> {
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
): Prisma.BatchOrderByWithRelationInput[] {
  const direction = ascending ? "asc" : "desc";
  return [{ createdAt: direction }, { id: direction }];
}
