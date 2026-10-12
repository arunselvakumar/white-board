import { Prisma, type PrismaClient } from "@repo/whiteboard-db";

import type {
  AbsenceNoticeRecord,
  AbsenceNoticeStore,
  LiveNoticeFilter,
  NewAbsenceNotice,
  NewNotification,
  NoticeEnrollment,
} from "../application/absence-notice-ports";
import type { ClassExceptions } from "../application/class-change-handlers";
import {
  familyEmails,
  isLinkedStudent,
  type FamilyRole,
} from "../application/family-links";
import { DomainError } from "../domain/errors";
import { WeeklyTimings } from "../domain/weekly-timings";
import { PrismaClassChangeStore } from "./prisma-class-change-store";
import { lockBatchSchedule } from "./schedule-locks";

type Db = PrismaClient | Prisma.TransactionClient;

const dbDate = (date: string) => new Date(`${date}T00:00:00.000Z`);
const dateKey = (date: Date) => date.toISOString().slice(0, 10);

const ENROLLMENT_INCLUDE = {
  batch: {
    select: {
      name: true,
      classMode: true,
      timezone: true,
      timings: true,
      closedAt: true,
      deletedAt: true,
    },
  },
  course: { select: { name: true, deletedAt: true } },
  student: { select: { deletedAt: true, droppedAt: true } },
} satisfies Prisma.TrainingInstituteEnrollmentInclude;

type EnrollmentRow = Prisma.TrainingInstituteEnrollmentGetPayload<{
  include: typeof ENROLLMENT_INCLUDE;
}>;

const NOTICE_INCLUDE = {
  student: { select: { name: true } },
  enrollment: { include: ENROLLMENT_INCLUDE },
} satisfies Prisma.TrainingInstituteAbsenceNoticeInclude;

type NoticeRow = Prisma.TrainingInstituteAbsenceNoticeGetPayload<{
  include: typeof NOTICE_INCLUDE;
}>;

function toEnrollment(row: EnrollmentRow): NoticeEnrollment {
  return {
    id: row.id,
    studentId: row.studentId,
    batchId: row.batchId,
    batchName: row.batch.name,
    courseName: row.course.name,
    classMode: row.classModeOverride ?? row.batch.classMode,
    timezone: row.batch.timezone,
    timings: WeeklyTimings.create(
      row.timingSource === "student" ? row.studentTimings : row.batch.timings,
    ).toJson(),
    activeFrom: row.createdAt,
    active:
      row.deletedAt == null &&
      row.endedAt == null &&
      row.batch.deletedAt == null &&
      row.batch.closedAt == null &&
      row.course.deletedAt == null &&
      row.student.deletedAt == null &&
      row.student.droppedAt == null,
  };
}

function toNotice(row: NoticeRow): AbsenceNoticeRecord {
  return {
    id: row.id,
    studentId: row.studentId,
    studentName: row.student.name,
    enrollment: toEnrollment(row.enrollment),
    batchId: row.batchId,
    date: dateKey(row.classDate),
    startTime: row.startTime,
    endTime: row.endTime,
    reason: row.reason,
    note: row.note,
    givenAt: row.givenAt,
    givenBy: {
      userId: row.givenByUserId,
      role: row.givenByRole,
      name: row.givenByName,
    },
    withdrawnAt: row.withdrawnAt,
  };
}

export class PrismaAbsenceNoticeStore implements AbsenceNoticeStore {
  constructor(private readonly db: Db) {}

  withBatchLocks<T>(
    workspaceId: string,
    batchIds: readonly string[],
    work: (store: AbsenceNoticeStore) => Promise<T>,
  ): Promise<T> {
    if (!("$transaction" in this.db))
      throw new Error("Schedule locks can't be nested.");
    return this.db.$transaction(async (tx) => {
      // Sorted, so two requests over the same Batches can't deadlock.
      for (const batchId of [...new Set(batchIds)].sort())
        await lockBatchSchedule(tx, workspaceId, batchId);
      return work(new PrismaAbsenceNoticeStore(tx));
    });
  }

  async linkedStudents(
    workspaceId: string,
    role: FamilyRole,
    verifiedEmails: readonly string[],
  ): Promise<{ id: string; name: string }[]> {
    const emails = familyEmails(verifiedEmails);
    if (emails.size === 0) return [];
    const students = await this.db.trainingInstituteStudent.findMany({
      where: { workspaceId, deletedAt: null, droppedAt: null },
      select: { id: true, name: true, email: true, profileDetails: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    return students
      .filter((student) => isLinkedStudent(student, role, emails))
      .map((student) => ({ id: student.id, name: student.name }));
  }

  async activeEnrollments(
    workspaceId: string,
    studentIds: readonly string[],
  ): Promise<NoticeEnrollment[]> {
    if (studentIds.length === 0) return [];
    const rows = await this.db.trainingInstituteEnrollment.findMany({
      where: {
        workspaceId,
        studentId: { in: [...studentIds] },
        deletedAt: null,
        endedAt: null,
        student: { deletedAt: null, droppedAt: null },
        batch: { workspaceId, deletedAt: null, closedAt: null },
        course: { deletedAt: null },
      },
      include: ENROLLMENT_INCLUDE,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map(toEnrollment);
  }

  async classExceptions(
    workspaceId: string,
    batchIds: readonly string[],
  ): Promise<ClassExceptions> {
    const changes = new PrismaClassChangeStore(this.db);
    const [batchChanges, holidays] = await Promise.all([
      Promise.all(
        [...new Set(batchIds)].map((batchId) =>
          changes.activeChanges(workspaceId, batchId),
        ),
      ),
      changes.activeHolidays(workspaceId),
    ]);
    return {
      changes: batchChanges.flat().map((change) => change.toFact()),
      holidays: holidays.map((holiday) => holiday.toFact()),
    };
  }

  async liveNotices(
    workspaceId: string,
    filter: LiveNoticeFilter,
  ): Promise<AbsenceNoticeRecord[]> {
    if (filter.studentIds?.length === 0 || filter.batchIds?.length === 0)
      return [];
    const rows = await this.db.trainingInstituteAbsenceNotice.findMany({
      where: {
        workspaceId,
        withdrawnAt: null,
        ...(filter.studentIds
          ? { studentId: { in: [...filter.studentIds] } }
          : {}),
        ...(filter.batchIds ? { batchId: { in: [...filter.batchIds] } } : {}),
        classDate: {
          gte: dbDate(filter.from),
          ...(filter.to ? { lte: dbDate(filter.to) } : {}),
        },
      },
      include: NOTICE_INCLUDE,
      orderBy: [{ classDate: "asc" }, { startTime: "asc" }, { givenAt: "asc" }],
    });
    return rows.map(toNotice);
  }

  async findNotice(
    workspaceId: string,
    id: string,
  ): Promise<AbsenceNoticeRecord | null> {
    const row = await this.db.trainingInstituteAbsenceNotice.findFirst({
      where: { id, workspaceId },
      include: NOTICE_INCLUDE,
    });
    return row == null ? null : toNotice(row);
  }

  async insertNotices(
    workspaceId: string,
    notices: readonly NewAbsenceNotice[],
  ): Promise<void> {
    try {
      await this.db.trainingInstituteAbsenceNotice.createMany({
        data: notices.map((notice) => ({
          id: notice.id,
          workspaceId,
          studentId: notice.studentId,
          enrollmentId: notice.enrollmentId,
          batchId: notice.batchId,
          classDate: dbDate(notice.date),
          startTime: notice.startTime,
          endTime: notice.endTime,
          reason: notice.reason,
          note: notice.note,
          givenAt: notice.givenAt,
          givenByUserId: notice.givenByUserId,
          givenByRole: notice.givenByRole,
          givenByName: notice.givenByName.slice(0, 200),
        })),
      });
    } catch (error) {
      // The partial unique index: a live notice for this Enrollment and Class.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new DomainError(
          "ABSENCE_NOTICE_ALREADY_GIVEN",
          "Notice has already been given for some of these Classes.",
        );
      throw error;
    }
  }

  async withdrawNotice(
    workspaceId: string,
    id: string,
    by: { userId: string; role: "student" | "parent" },
    now: Date,
  ): Promise<boolean> {
    const { count } = await this.db.trainingInstituteAbsenceNotice.updateMany({
      where: { id, workspaceId, withdrawnAt: null },
      data: {
        withdrawnAt: now,
        withdrawnByUserId: by.userId,
        withdrawnByRole: by.role,
      },
    });
    return count === 1;
  }

  async assignedBatchIds(
    workspaceId: string,
    userId: string,
  ): Promise<string[]> {
    const rows = await this.db.trainingInstituteBatchTeacherAssignment.findMany(
      {
        where: {
          workspaceId,
          unassignedAt: null,
          deletedAt: null,
          teacher: { userId, deletedAt: null, deactivatedAt: null },
        },
        select: { batchId: true },
      },
    );
    return [...new Set(rows.map((row) => row.batchId))];
  }

  async batchTeacherUsers(
    workspaceId: string,
    batchIds: readonly string[],
  ): Promise<{ batchId: string; userId: string }[]> {
    if (batchIds.length === 0) return [];
    const rows = await this.db.trainingInstituteBatchTeacherAssignment.findMany(
      {
        where: {
          workspaceId,
          batchId: { in: [...new Set(batchIds)] },
          unassignedAt: null,
          deletedAt: null,
          teacher: {
            workspaceId,
            deletedAt: null,
            deactivatedAt: null,
            userId: { not: null },
          },
        },
        select: { batchId: true, teacher: { select: { userId: true } } },
        orderBy: [{ assignedAt: "asc" }, { id: "asc" }],
      },
    );
    const seen = new Set<string>();
    return rows.flatMap((row) => {
      const userId = row.teacher.userId;
      const key = `${row.batchId}|${userId ?? ""}`;
      if (userId == null || seen.has(key)) return [];
      seen.add(key);
      return [{ batchId: row.batchId, userId }];
    });
  }

  async insertNotifications(
    workspaceId: string,
    notifications: readonly NewNotification[],
  ): Promise<void> {
    if (notifications.length === 0) return;
    await this.db.trainingInstituteNotification.createMany({
      data: notifications.map((notification) => ({
        id: notification.id,
        workspaceId,
        recipientUserId: notification.recipientUserId,
        kind: notification.kind,
        payload: notification.payload,
        createdAt: notification.createdAt,
      })),
    });
  }
}
