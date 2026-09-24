import { Prisma, type PrismaClient } from "@repo/db";

import { StudentNotFoundError } from "../application/not-found-error";
import type { ListPage } from "../domain/list";
import type { Student } from "../domain/student";
import type { StudentId } from "../domain/student-id";
import type {
  StudentListParams,
  StudentRepository,
} from "../domain/student-repository";
import type { WorkspaceId } from "../domain/workspace-id";
import { toDomainStudent } from "./prisma-student-mapper";

export class PrismaStudentRepository implements StudentRepository {
  constructor(private readonly db: PrismaClient) {}

  async save(student: Student): Promise<void> {
    const mutable = {
      name: student.name.value,
      phone: student.phone.value,
      email: student.email?.value ?? null,
      photoUrl: student.photoUrl?.value ?? null,
      address: student.address?.value ?? null,
      idProofNote: student.idProofNote?.value ?? null,
      guardianName: student.guardianName?.value ?? null,
      guardianPhone: student.guardianPhone?.value ?? null,
      profileDetails: student.details as unknown as Prisma.InputJsonValue,
      droppedAt: student.droppedAt,
      droppedByUserId: student.droppedByUserId?.value ?? null,
      updatedAt: student.updatedAt,
      deletedAt: student.deletedAt,
      deletedByUserId: student.deletedByUserId?.value ?? null,
    };

    const updated = await this.db.student.updateMany({
      where: { id: student.id.value, deletedAt: null },
      data: mutable,
    });
    if (updated.count > 0) {
      return;
    }

    if (student.deletedAt != null) {
      throw new StudentNotFoundError();
    }

    try {
      await this.db.student.create({
        data: {
          id: student.id.value,
          workspaceId: student.workspaceId.value,
          createdByUserId: student.createdByUserId.value,
          createdAt: student.createdAt,
          ...mutable,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new StudentNotFoundError();
      }
      throw error;
    }
  }

  async findByIdInWorkspace(
    id: StudentId,
    workspaceId: WorkspaceId,
  ): Promise<Student | null> {
    const row = await this.db.student.findFirst({
      where: {
        id: id.value,
        workspaceId: workspaceId.value,
        deletedAt: null,
      },
    });
    return row == null ? null : toDomainStudent(row);
  }

  async listInWorkspace(params: StudentListParams): Promise<ListPage<Student>> {
    const q = params.q?.trim();
    const searchWhere: Prisma.StudentWhereInput | undefined =
      q != null && q.length > 0
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { phone: { contains: q } },
            ],
          }
        : undefined;
    const cursor = cursorWhere(params);
    const where: Prisma.StudentWhereInput = {
      workspaceId: params.workspaceId.value,
      deletedAt: null,
      AND: [searchWhere, cursor].filter(
        (part): part is Prisma.StudentWhereInput =>
          part != null && Object.keys(part).length > 0,
      ),
    };

    const orderBy = listOrderBy(params.before != null);

    const [rows, total] = await Promise.all([
      this.db.student.findMany({
        where,
        orderBy,
        take: params.limit + 1,
      }),
      this.db.student.count({
        where: {
          workspaceId: params.workspaceId.value,
          deletedAt: null,
          ...(q != null && q.length > 0
            ? {
                OR: [
                  { name: { contains: q, mode: "insensitive" } },
                  { phone: { contains: q } },
                ],
              }
            : {}),
        },
      }),
    ]);

    const hasMore = rows.length > params.limit;
    const pageRows = hasMore ? rows.slice(0, params.limit) : rows;
    const inDisplayOrder =
      params.before != null ? [...pageRows].reverse() : pageRows;

    return {
      items: inDisplayOrder.map(toDomainStudent),
      total,
      hasMore,
    };
  }
}

function cursorWhere(
  params: StudentListParams,
): Pick<Prisma.StudentWhereInput, "OR"> | Record<string, never> {
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
): Prisma.StudentOrderByWithRelationInput[] {
  const direction = ascending ? "asc" : "desc";
  return [{ createdAt: direction }, { id: direction }];
}
