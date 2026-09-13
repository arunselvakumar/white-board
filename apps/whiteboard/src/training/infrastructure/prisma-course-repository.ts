import { Prisma, type PrismaClient } from "@repo/db";

import { CourseNotFoundError } from "../application/not-found-error";
import type { Course } from "../domain/course";
import type { CourseId } from "../domain/course-id";
import type {
  CourseListParams,
  CourseRepository,
} from "../domain/course-repository";
import type { ListPage } from "../domain/list";
import type { WorkspaceId } from "../domain/workspace-id";
import { toDomainCourse } from "./prisma-course-mapper";

export class PrismaCourseRepository implements CourseRepository {
  constructor(private readonly db: PrismaClient) {}

  async save(course: Course): Promise<void> {
    const mutable = {
      name: course.name.value,
      duration: course.duration.value,
      description: course.description?.value ?? null,
      defaultFeeAmountPaise: course.defaultFeeAmount.value,
      archivedAt: course.archivedAt,
      archivedByUserId: course.archivedByUserId?.value ?? null,
      updatedAt: course.updatedAt,
      deletedAt: course.deletedAt,
      deletedByUserId: course.deletedByUserId?.value ?? null,
    };

    const updated = await this.db.course.updateMany({
      where: { id: course.id.value, deletedAt: null },
      data: mutable,
    });
    if (updated.count > 0) {
      return;
    }

    if (course.deletedAt != null) {
      throw new CourseNotFoundError();
    }

    try {
      await this.db.course.create({
        data: {
          id: course.id.value,
          workspaceId: course.workspaceId.value,
          createdByUserId: course.createdByUserId.value,
          createdAt: course.createdAt,
          ...mutable,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new CourseNotFoundError();
      }
      throw error;
    }
  }

  async findByIdInWorkspace(
    id: CourseId,
    workspaceId: WorkspaceId,
  ): Promise<Course | null> {
    const row = await this.db.course.findFirst({
      where: {
        id: id.value,
        workspaceId: workspaceId.value,
        deletedAt: null,
      },
    });
    return row == null ? null : toDomainCourse(row);
  }

  async listInWorkspace(params: CourseListParams): Promise<ListPage<Course>> {
    const where: Prisma.CourseWhereInput = {
      workspaceId: params.workspaceId.value,
      deletedAt: null,
      ...cursorWhere(params),
    };

    const orderBy = listOrderBy(params.before != null);

    const [rows, total] = await Promise.all([
      this.db.course.findMany({
        where,
        orderBy,
        take: params.limit + 1,
      }),
      this.db.course.count({
        where: {
          workspaceId: params.workspaceId.value,
          deletedAt: null,
        },
      }),
    ]);

    const hasMore = rows.length > params.limit;
    const pageRows = hasMore ? rows.slice(0, params.limit) : rows;
    const inDisplayOrder =
      params.before != null ? [...pageRows].reverse() : pageRows;

    return {
      items: inDisplayOrder.map(toDomainCourse),
      total,
      hasMore,
    };
  }
}

function cursorWhere(
  params: CourseListParams,
): Pick<Prisma.CourseWhereInput, "OR"> | Record<string, never> {
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
): Prisma.CourseOrderByWithRelationInput[] {
  const direction = ascending ? "asc" : "desc";
  return [{ createdAt: direction }, { id: direction }];
}
