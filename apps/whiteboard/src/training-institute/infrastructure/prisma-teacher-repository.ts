import { Prisma, type PrismaClient } from "@repo/db";

import { TeacherNotFoundError } from "../application/not-found-error";
import { DomainError } from "../domain/errors";
import type { ListPage } from "../domain/list";
import { Teacher } from "../domain/teacher";
import { teacherDetailsFromStored } from "../domain/teacher-details";
import type {
  TeacherListParams,
  TeacherPersistenceChanges,
  TeacherRepository,
} from "../domain/teacher-repository";
import { encryptPrivateText } from "./teacher-private-data";

export class PrismaTeacherRepository implements TeacherRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(
    teacher: Teacher,
    changes: TeacherPersistenceChanges = {},
  ): Promise<void> {
    try {
      const privateData = privateDataChanges(changes);
      await this.db.trainingInstituteTeacher.create({
        data: {
          id: teacher.id,
          workspaceId: teacher.workspaceId,
          createdByUserId: teacher.createdByUserId,
          name: teacher.name,
          email: teacher.email,
          kind: teacher.kind,
          phone: teacher.phone,
          qualificationSummary: teacher.qualificationSummary,
          profileDetails: teacher.details,
          photoMimeType: teacher.photoMimeType,
          photoUpdatedAt: teacher.photoUpdatedAt,
          photoData: changes.photoData,
          idNumberLast4: teacher.idNumberLast4,
          bankAccountLast4: teacher.bankAccountLast4,
          ...privateData,
          clerkUserId: teacher.clerkUserId,
          invitationId: teacher.invitationId,
          invitationStatus: teacher.invitationStatus,
          deactivatedAt: teacher.deactivatedAt,
          deactivatedByUserId: teacher.deactivatedByUserId,
          createdAt: teacher.createdAt,
          updatedAt: teacher.updatedAt,
        },
      });
    } catch (error) {
      if (isUniqueError(error)) {
        throw new DomainError(
          "TEACHER_EMAIL_IN_USE",
          "A Teacher with this email already exists in the Workspace.",
        );
      }
      throw error;
    }
  }

  async save(
    teacher: Teacher,
    changes: TeacherPersistenceChanges = {},
  ): Promise<void> {
    try {
      const privateData = privateDataChanges(changes);
      const result = await this.db.trainingInstituteTeacher.updateMany({
        where: {
          id: teacher.id,
          workspaceId: teacher.workspaceId,
          deletedAt: null,
        },
        data: {
          name: teacher.name,
          kind: teacher.kind,
          phone: teacher.phone,
          qualificationSummary: teacher.qualificationSummary,
          profileDetails: teacher.details,
          photoMimeType: teacher.photoMimeType,
          photoUpdatedAt: teacher.photoUpdatedAt,
          ...(changes.photoData == null
            ? {}
            : { photoData: changes.photoData }),
          idNumberLast4: teacher.idNumberLast4,
          bankAccountLast4: teacher.bankAccountLast4,
          ...privateData,
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
        throw new DomainError(
          "TEACHER_USER_IN_USE",
          "This User is linked to another Teacher.",
        );
      }
      throw error;
    }
  }

  async findByIdInWorkspace(
    id: string,
    workspaceId: string,
  ): Promise<Teacher | null> {
    const row = await this.db.trainingInstituteTeacher.findFirst({
      where: { id, workspaceId, deletedAt: null },
      omit: PRIVATE_DATA_OMIT,
    });
    return row == null ? null : fromRow(row);
  }

  async findPhotoByIdInWorkspace(
    id: string,
    workspaceId: string,
  ): Promise<{ mimeType: string; bytes: Uint8Array } | null> {
    const row = await this.db.trainingInstituteTeacher.findFirst({
      where: { id, workspaceId, deletedAt: null, photoData: { not: null } },
      select: { photoData: true, photoMimeType: true },
    });
    return row?.photoData != null && row.photoMimeType != null
      ? { mimeType: row.photoMimeType, bytes: row.photoData }
      : null;
  }

  async findByClerkUserInWorkspace(
    clerkUserId: string,
    workspaceId: string,
  ): Promise<Teacher | null> {
    const row = await this.db.trainingInstituteTeacher.findFirst({
      where: { clerkUserId, workspaceId, deletedAt: null, deactivatedAt: null },
      omit: PRIVATE_DATA_OMIT,
    });
    return row == null ? null : fromRow(row);
  }

  async listInWorkspace(params: TeacherListParams): Promise<ListPage<Teacher>> {
    const countWhere: Prisma.TrainingInstituteTeacherWhereInput = {
      workspaceId: params.workspaceId,
      deletedAt: null,
    };
    const cursorWhere: Prisma.TrainingInstituteTeacherWhereInput =
      params.after != null
        ? {
            OR: [
              { createdAt: { lt: params.after.createdAt } },
              {
                createdAt: params.after.createdAt,
                id: { lt: params.after.id.value },
              },
            ],
          }
        : params.before != null
          ? {
              OR: [
                { createdAt: { gt: params.before.createdAt } },
                {
                  createdAt: params.before.createdAt,
                  id: { gt: params.before.id.value },
                },
              ],
            }
          : {};
    const direction = params.before != null ? "asc" : "desc";
    const [rows, total] = await Promise.all([
      this.db.trainingInstituteTeacher.findMany({
        where: { ...countWhere, ...cursorWhere },
        orderBy: [{ createdAt: direction }, { id: direction }],
        take: params.limit + 1,
        omit: PRIVATE_DATA_OMIT,
      }),
      this.db.trainingInstituteTeacher.count({ where: countWhere }),
    ]);
    const hasMore = rows.length > params.limit;
    const pageRows = hasMore ? rows.slice(0, params.limit) : rows;
    return {
      items: (params.before != null ? [...pageRows].reverse() : pageRows).map(
        fromRow,
      ),
      total,
      hasMore,
    };
  }
}

const PRIVATE_DATA_OMIT = {
  photoData: true,
  idNumberEncrypted: true,
  bankAccountEncrypted: true,
} as const;
type TeacherRow = Omit<
  Prisma.TrainingInstituteTeacherGetPayload<Record<string, never>>,
  keyof typeof PRIVATE_DATA_OMIT
>;

function fromRow(row: TeacherRow): Teacher {
  return Teacher.reconstitute({
    ...row,
    kind: row.kind,
    invitationStatus: row.invitationStatus,
    details: teacherDetailsFromStored(row.profileDetails),
  });
}

function isUniqueError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function privateDataChanges(changes: TeacherPersistenceChanges): {
  idNumberEncrypted?: string | null;
  bankAccountEncrypted?: string | null;
} {
  return {
    ...(changes.idNumber === undefined
      ? {}
      : {
          idNumberEncrypted:
            changes.idNumber == null || changes.idNumber.trim() === ""
              ? null
              : encryptPrivateText(changes.idNumber.trim()),
        }),
    ...(changes.bankAccountNumber === undefined
      ? {}
      : {
          bankAccountEncrypted:
            changes.bankAccountNumber == null ||
            changes.bankAccountNumber.trim() === ""
              ? null
              : encryptPrivateText(changes.bankAccountNumber.trim()),
        }),
  };
}
