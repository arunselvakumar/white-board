import { Prisma, type PrismaClient } from "@repo/db";

import { AttendanceRegister } from "../domain/attendance-register";
import type {
  AttendanceBatch,
  AttendanceHistoryItem,
  AttendanceRepository,
} from "../domain/attendance-repository";
import type { ListCursor, ListPage } from "../domain/list";
import { WeeklyTimings } from "../domain/weekly-timings";

const dateValue = (date: string) => new Date(`${date}T00:00:00.000Z`);

export class PrismaAttendanceRepository implements AttendanceRepository {
  constructor(private readonly db: PrismaClient) {}

  async findBatch(
    batchId: string,
    workspaceId: string,
  ): Promise<AttendanceBatch | null> {
    return this.db.trainingInstituteBatch.findFirst({
      where: { id: batchId, workspaceId, deletedAt: null },
      select: {
        id: true,
        timezone: true,
        timings: true,
        closedAt: true,
        createdAt: true,
      },
    });
  }

  async isAssignedTeacher(
    userId: string,
    batchId: string,
    workspaceId: string,
  ): Promise<boolean> {
    const teacher = await this.db.trainingInstituteTeacher.findFirst({
      where: {
        workspaceId,
        userId,
        deletedAt: null,
        deactivatedAt: null,
        batchAssignments: {
          some: { batchId, workspaceId, unassignedAt: null, deletedAt: null },
        },
      },
      select: { id: true },
    });
    return teacher != null;
  }

  async findByBatchDate(
    batchId: string,
    workspaceId: string,
    date: string,
  ): Promise<AttendanceRegister | null> {
    const row = await this.db.trainingInstituteAttendanceRegister.findFirst({
      where: { batchId, workspaceId, date: dateValue(date), deletedAt: null },
      include: { marks: { where: { deletedAt: null } } },
    });
    return row == null ? null : fromRow(row);
  }

  async activeRoster(batchId: string, workspaceId: string) {
    const enrollments = await this.db.trainingInstituteEnrollment.findMany({
      where: {
        batchId,
        workspaceId,
        deletedAt: null,
        endedAt: null,
        student: { deletedAt: null, droppedAt: null },
      },
      include: { student: true },
      orderBy: [{ student: { name: "asc" } }, { id: "asc" }],
    });
    const batch = await this.db.trainingInstituteBatch.findUniqueOrThrow({
      where: { id: batchId },
      select: { timings: true },
    });
    return enrollments.map((enrollment) => ({
      enrollmentId: enrollment.id,
      studentId: enrollment.studentId,
      studentName: enrollment.student.name,
      timings: WeeklyTimings.create(
        enrollment.timingSource === "student"
          ? enrollment.studentTimings
          : batch.timings,
      ).toJson(),
    }));
  }

  async create(register: AttendanceRegister): Promise<void> {
    try {
      await this.db.trainingInstituteAttendanceRegister.create({
        data: {
          id: register.id,
          workspaceId: register.workspaceId,
          batchId: register.batchId,
          date: dateValue(register.date),
          timezone: register.timezone,
          createdByUserId: register.createdByUserId,
          createdAt: register.createdAt,
          updatedAt: register.updatedAt,
          marks: {
            create: register.marks.map((mark) => ({
              id: mark.id,
              workspaceId: register.workspaceId,
              enrollmentId: mark.enrollmentId,
              studentId: mark.studentId,
              studentNameSnapshot: mark.studentName,
              status: mark.status,
              note: mark.note,
              createdAt: mark.createdAt,
              updatedAt: mark.updatedAt,
            })),
          },
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        return;
      throw error;
    }
  }

  async findById(
    id: string,
    workspaceId: string,
  ): Promise<AttendanceRegister | null> {
    const row = await this.db.trainingInstituteAttendanceRegister.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: { marks: { where: { deletedAt: null } } },
    });
    return row == null ? null : fromRow(row);
  }

  async saveMarks(
    id: string,
    workspaceId: string,
    input: { enrollmentId: string; status: string; note?: string | null }[],
    userId: string,
  ): Promise<AttendanceRegister | null> {
    return this.db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT id FROM training_institute.attendance_registers WHERE id = ${id}::uuid AND workspace_id = ${workspaceId} AND deleted_at IS NULL FOR UPDATE`,
      );
      if (locked.length === 0) return null;
      const row = await tx.trainingInstituteAttendanceRegister.findFirst({
        where: { id, workspaceId, deletedAt: null },
        include: { marks: { where: { deletedAt: null } } },
      });
      if (row == null) return null;
      const register = fromRow(row);
      const now = new Date();
      const changes = register.mark(input, userId, now);
      for (const change of changes) {
        await tx.trainingInstituteAttendanceMark.update({
          where: { id: change.markId },
          data: {
            status: change.newStatus,
            note: change.newNote,
            markedByUserId: userId,
            markedAt: now,
            updatedAt: now,
          },
        });
        await tx.trainingInstituteAttendanceMarkChange.create({
          data: {
            id: crypto.randomUUID(),
            markId: change.markId,
            oldStatus: change.oldStatus,
            newStatus: change.newStatus,
            oldNote: change.oldNote,
            newNote: change.newNote,
            changedByUserId: userId,
            changedAt: now,
          },
        });
      }
      if (changes.length > 0)
        await tx.trainingInstituteAttendanceRegister.update({
          where: { id },
          data: { updatedAt: now },
        });
      return register;
    });
  }

  async listBatch(params: {
    batchId: string;
    workspaceId: string;
    limit: number;
    after?: ListCursor<{ value: string }>;
    before?: ListCursor<{ value: string }>;
  }): Promise<ListPage<AttendanceRegister>> {
    const base: Prisma.TrainingInstituteAttendanceRegisterWhereInput = {
      batchId: params.batchId,
      workspaceId: params.workspaceId,
      deletedAt: null,
    };
    const cursor = cursorWhere(params.after, params.before);
    const direction = params.before != null ? "asc" : "desc";
    const [rows, total] = await Promise.all([
      this.db.trainingInstituteAttendanceRegister.findMany({
        where: { ...base, ...cursor },
        include: { marks: { where: { deletedAt: null } } },
        orderBy: [{ createdAt: direction }, { id: direction }],
        take: params.limit + 1,
      }),
      this.db.trainingInstituteAttendanceRegister.count({ where: base }),
    ]);
    const hasMore = rows.length > params.limit;
    const items = hasMore ? rows.slice(0, params.limit) : rows;
    return {
      items: (params.before != null ? [...items].reverse() : items).map(
        fromRow,
      ),
      total,
      hasMore,
    };
  }

  async studentExists(
    studentId: string,
    workspaceId: string,
  ): Promise<boolean> {
    return (
      (await this.db.trainingInstituteStudent.count({
        where: { id: studentId, workspaceId, deletedAt: null },
      })) > 0
    );
  }

  async listStudentHistory(params: {
    studentId: string;
    workspaceId: string;
    limit: number;
    after?: ListCursor<{ value: string }>;
    before?: ListCursor<{ value: string }>;
  }): Promise<ListPage<AttendanceHistoryItem>> {
    const base: Prisma.TrainingInstituteAttendanceMarkWhereInput = {
      studentId: params.studentId,
      workspaceId: params.workspaceId,
      deletedAt: null,
      register: { deletedAt: null },
    };
    const cursor = cursorWhere(params.after, params.before);
    const direction = params.before != null ? "asc" : "desc";
    const [rows, total] = await Promise.all([
      this.db.trainingInstituteAttendanceMark.findMany({
        where: { ...base, ...cursor },
        include: { register: { include: { batch: true } } },
        orderBy: [{ createdAt: direction }, { id: direction }],
        take: params.limit + 1,
      }),
      this.db.trainingInstituteAttendanceMark.count({ where: base }),
    ]);
    const hasMore = rows.length > params.limit;
    const items = hasMore ? rows.slice(0, params.limit) : rows;
    return {
      items: (params.before != null ? [...items].reverse() : items).map(
        (row) => ({
          id: row.id,
          registerId: row.registerId,
          batchId: row.register.batchId,
          batchName: row.register.batch.name,
          date: row.register.date.toISOString().slice(0, 10),
          status: row.status,
          note: row.note,
          createdAt: row.createdAt,
        }),
      ),
      total,
      hasMore,
    };
  }
}

type RegisterRow = Prisma.TrainingInstituteAttendanceRegisterGetPayload<{
  include: { marks: true };
}>;

function fromRow(row: RegisterRow): AttendanceRegister {
  return AttendanceRegister.reconstitute({
    id: row.id,
    workspaceId: row.workspaceId,
    batchId: row.batchId,
    date: row.date.toISOString().slice(0, 10),
    timezone: row.timezone,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    marks: row.marks
      .filter((mark) => mark.deletedAt == null)
      .map((mark) => ({
        id: mark.id,
        enrollmentId: mark.enrollmentId,
        studentId: mark.studentId,
        studentName: mark.studentNameSnapshot,
        status: mark.status,
        note: mark.note,
        markedByUserId: mark.markedByUserId,
        markedAt: mark.markedAt,
        createdAt: mark.createdAt,
        updatedAt: mark.updatedAt,
      }))
      .sort(
        (a, b) =>
          a.studentName.localeCompare(b.studentName) ||
          a.id.localeCompare(b.id),
      ),
  });
}

function cursorWhere(
  after?: ListCursor<{ value: string }>,
  before?: ListCursor<{ value: string }>,
) {
  const cursor = after ?? before;
  if (cursor == null) return {};
  const op = after == null ? "gt" : "lt";
  return {
    OR: [
      { createdAt: { [op]: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { [op]: cursor.id.value } },
    ],
  };
}
