import type { PrismaClient } from "@repo/db";

import {
  FAMILY_HOME_RECENT_LIMIT,
  type FamilyAttendanceStatus,
  type FamilyHomeData,
  type FamilyHomeSource,
} from "../application/family-home";
import {
  familyEmails,
  isLinkedStudent,
  type FamilyRole,
} from "../application/family-links";
import { localNow } from "../domain/class-schedule";
import type { ClassExceptionsReader } from "../application/class-change-handlers";
import { toEnrollmentItem } from "./prisma-calendar-schedule-reader";

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export class PrismaFamilyHomeSource implements FamilyHomeSource {
  constructor(
    private readonly db: PrismaClient,
    private readonly exceptions: ClassExceptionsReader,
  ) {}

  async load(input: {
    workspaceId: string;
    role: FamilyRole;
    verifiedEmails: readonly string[];
  }): Promise<FamilyHomeData> {
    const { workspaceId, role } = input;
    const empty: FamilyHomeData = {
      students: [],
      enrollments: [],
      changes: [],
      holidays: [],
      attendance: [],
      recordings: [],
    };
    const emails = familyEmails(input.verifiedEmails);
    if (emails.size === 0) return empty;
    const students = (
      await this.db.trainingInstituteStudent.findMany({
        where: { workspaceId, deletedAt: null, droppedAt: null },
        select: { id: true, name: true, email: true, profileDetails: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      })
    ).filter((student) => isLinkedStudent(student, role, emails));
    if (students.length === 0) return empty;
    const studentIds = students.map((student) => student.id);

    const [enrollments, attendance] = await Promise.all([
      this.db.trainingInstituteEnrollment.findMany({
        where: {
          workspaceId,
          studentId: { in: studentIds },
          deletedAt: null,
          endedAt: null,
          batch: { workspaceId, deletedAt: null, closedAt: null },
          course: { deletedAt: null },
        },
        include: {
          student: { select: { name: true } },
          batch: true,
          course: { select: { name: true } },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      }),
      Promise.all(
        studentIds.map((studentId) =>
          this.db.trainingInstituteAttendanceMark.findMany({
            where: {
              workspaceId,
              studentId,
              deletedAt: null,
              status: { not: "unmarked" },
              register: { workspaceId, deletedAt: null },
            },
            include: {
              register: {
                select: {
                  date: true,
                  batch: {
                    select: { name: true, course: { select: { name: true } } },
                  },
                },
              },
            },
            orderBy: [{ register: { date: "desc" } }, { markedAt: "desc" }],
            take: FAMILY_HOME_RECENT_LIMIT,
          }),
        ),
      ),
    ]);

    const enrollmentIds = enrollments.map((enrollment) => enrollment.id);
    const [payments, exceptions, recordings] = await Promise.all([
      enrollmentIds.length === 0
        ? []
        : this.db.trainingInstituteFeePayment.groupBy({
            by: ["enrollmentId"],
            where: {
              workspaceId,
              enrollmentId: { in: enrollmentIds },
              deletedAt: null,
            },
            _sum: { amountPaise: true },
          }),
      this.exceptions.forBatches(
        workspaceId,
        enrollments.map((enrollment) => enrollment.batchId),
      ),
      enrollments.length === 0
        ? []
        : this.db.trainingInstituteClassOccurrence.findMany({
            where: {
              workspaceId,
              recordingStatus: "ready",
              recordingObjectKey: { not: null },
              OR: enrollments.map((enrollment) => ({
                batchId: enrollment.batchId,
                classDate: {
                  gte: new Date(
                    `${localNow(enrollment.createdAt, enrollment.batch.timezone).date}T00:00:00.000Z`,
                  ),
                },
              })),
            },
            select: {
              batchId: true,
              classDate: true,
              startTime: true,
              endTime: true,
            },
            orderBy: [{ classDate: "desc" }, { startTime: "desc" }],
          }),
    ]);
    const paidByEnrollment = new Map(
      payments.map((row) => [row.enrollmentId, row._sum.amountPaise ?? 0]),
    );

    return {
      students: students.map((student) => ({
        id: student.id,
        name: student.name,
      })),
      enrollments: enrollments.map((enrollment) => ({
        ...toEnrollmentItem(enrollment),
        studentId: enrollment.studentId,
        feePlanAmountPaise: enrollment.feePlanAmountPaise,
        feePlanConcessionPaise: enrollment.feePlanConcessionPaise,
        paidPaise: paidByEnrollment.get(enrollment.id) ?? 0,
      })),
      changes: exceptions.changes,
      holidays: exceptions.holidays,
      attendance: attendance.flat().map((mark) => ({
        studentId: mark.studentId,
        date: dateOnly(mark.register.date),
        batchName: mark.register.batch.name,
        courseName: mark.register.batch.course.name,
        status: mark.status as FamilyAttendanceStatus,
      })),
      recordings: recordings.map((recording) => ({
        batchId: recording.batchId,
        date: dateOnly(recording.classDate),
        startTime: recording.startTime,
        endTime: recording.endTime,
      })),
    };
  }
}
