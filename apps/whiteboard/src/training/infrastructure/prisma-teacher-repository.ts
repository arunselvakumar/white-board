import { Prisma, type PrismaClient } from "@repo/db";

import { TeacherNotFoundError } from "../application/not-found-error";
import { DomainError } from "../domain/errors";
import type { ListPage } from "../domain/list";
import { Teacher } from "../domain/teacher";
import type { TeacherListParams, TeacherRepository } from "../domain/teacher-repository";

export class PrismaTeacherRepository implements TeacherRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(teacher: Teacher): Promise<void> {
    try {
      await this.db.teacher.create({ data: {
        id: teacher.id,
        workspaceId: teacher.workspaceId,
        createdByUserId: teacher.createdByUserId,
        name: teacher.name,
        email: teacher.email,
        kind: teacher.kind,
        phone: teacher.phone,
        qualificationSummary: teacher.qualificationSummary,
        clerkUserId: teacher.clerkUserId,
        invitationId: teacher.invitationId,
        invitationStatus: teacher.invitationStatus,
        deactivatedAt: teacher.deactivatedAt,
        deactivatedByUserId: teacher.deactivatedByUserId,
        createdAt: teacher.createdAt,
        updatedAt: teacher.updatedAt,
      } });
    } catch (error) {
      if (isUniqueError(error)) {
        throw new DomainError("TEACHER_EMAIL_IN_USE", "A Teacher with this email already exists in the Workspace.");
      }
      throw error;
    }
  }

  async save(teacher: Teacher): Promise<void> {
    try {
      const result = await this.db.teacher.updateMany({
        where: { id: teacher.id, workspaceId: teacher.workspaceId, deletedAt: null },
        data: {
          name: teacher.name,
          kind: teacher.kind,
          phone: teacher.phone,
          qualificationSummary: teacher.qualificationSummary,
          clerkUserId: teacher.clerkUserId,
          invitationId: teacher.invitationId,
          invitationStatus: teacher.invitationStatus,
          deactivatedAt: teacher.deactivatedAt,
          deactivatedByUserId: teacher.deactivatedByUserId,
          updatedAt: teacher.updatedAt,
        },
      });
      if (result.count === 0) throw new TeacherNotFoundError();
    } catch (error) {
      if (isUniqueError(error)) {
        throw new DomainError("TEACHER_USER_IN_USE", "This User is linked to another Teacher.");
      }
      throw error;
    }
  }

  async findByIdInWorkspace(id: string, workspaceId: string): Promise<Teacher | null> {
    const row = await this.db.teacher.findFirst({ where: { id, workspaceId, deletedAt: null } });
    return row == null ? null : fromRow(row);
  }

  async findByClerkUserInWorkspace(clerkUserId: string, workspaceId: string): Promise<Teacher | null> {
    const row = await this.db.teacher.findFirst({ where: { clerkUserId, workspaceId, deletedAt: null, deactivatedAt: null } });
    return row == null ? null : fromRow(row);
  }

  async listInWorkspace(params: TeacherListParams): Promise<ListPage<Teacher>> {
    const countWhere: Prisma.TeacherWhereInput = { workspaceId: params.workspaceId, deletedAt: null };
    const cursorWhere: Prisma.TeacherWhereInput = params.after != null ? {
      OR: [
        { createdAt: { lt: params.after.createdAt } },
        { createdAt: params.after.createdAt, id: { lt: params.after.id.value } },
      ],
    } : params.before != null ? {
      OR: [
        { createdAt: { gt: params.before.createdAt } },
        { createdAt: params.before.createdAt, id: { gt: params.before.id.value } },
      ],
    } : {};
    const direction = params.before != null ? "asc" : "desc";
    const [rows, total] = await Promise.all([
      this.db.teacher.findMany({
        where: { ...countWhere, ...cursorWhere },
        orderBy: [{ createdAt: direction }, { id: direction }],
        take: params.limit + 1,
      }),
      this.db.teacher.count({ where: countWhere }),
    ]);
    const hasMore = rows.length > params.limit;
    const pageRows = (hasMore ? rows.slice(0, params.limit) : rows);
    return {
      items: (params.before != null ? [...pageRows].reverse() : pageRows).map(fromRow),
      total,
      hasMore,
    };
  }
}

type TeacherRow = Prisma.TeacherGetPayload<Record<string, never>>;

function fromRow(row: TeacherRow): Teacher {
  return Teacher.reconstitute({
    ...row,
    kind: row.kind,
    invitationStatus: row.invitationStatus,
  });
}

function isUniqueError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
