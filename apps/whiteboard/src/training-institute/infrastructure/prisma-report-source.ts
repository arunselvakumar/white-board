import type { PrismaClient } from "@repo/whiteboard-db";

import {
  familyEmails,
  isLinkedStudent,
  normalizedEmail,
} from "../application/family-links";
import type {
  DateRange,
  ReportDemo,
  ReportEnquiry,
  ReportEnrollment,
  ReportSource,
  ReportStructure,
  ReportStudent,
  ReportTest,
} from "../application/report-ports";
import type { FeePlanDueDate } from "../domain/fee-plan";
import {
  DEFAULT_REPORT_SETTINGS,
  type ReportSettings,
} from "../domain/report-settings";
import type { WeeklySlot } from "../domain/weekly-timings";
import { PrismaClassExceptionsReader } from "./prisma-class-change-store";

/** Workspace and User names live in identity, behind @repo/auth (ADR-0034). */
export type ReportNames = {
  workspaceName(workspaceId: string): Promise<string>;
  displayNames(userIds: string[]): Promise<Map<string, string>>;
};

const day = (value: Date) => value.toISOString().slice(0, 10);
const dateValue = (value: string) => new Date(`${value}T00:00:00.000Z`);

type ProfileContacts = {
  father?: { primaryPhone?: unknown; email?: unknown } | null;
  mother?: { primaryPhone?: unknown; email?: unknown } | null;
  guardians?: { phone?: unknown; email?: unknown }[] | null;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/** The parent's phone first; the Student's own when no parent phone is on file. */
export function contactPhone(student: {
  phone: string;
  guardianPhone: string | null;
  profileDetails: unknown;
}): string | null {
  const details = (student.profileDetails ?? {}) as ProfileContacts;
  return (
    text(student.guardianPhone) ??
    text(details.father?.primaryPhone) ??
    text(details.mother?.primaryPhone) ??
    (Array.isArray(details.guardians)
      ? details.guardians
          .map((guardian) => text(guardian.phone))
          .find((value) => value != null)
      : null) ??
    text(student.phone)
  );
}

/** Father, mother and Guardian emails, the addresses Parent Users link by. */
export function parentEmails(profileDetails: unknown): string[] {
  const details = (profileDetails ?? {}) as ProfileContacts;
  const emails = [
    details.father?.email,
    details.mother?.email,
    ...(Array.isArray(details.guardians)
      ? details.guardians.map((item) => item.email)
      : []),
  ]
    .map(normalizedEmail)
    .filter((email): email is string => email != null);
  return [...new Set(emails)];
}

export class PrismaReportSource implements ReportSource {
  constructor(
    private readonly db: PrismaClient,
    private readonly names: ReportNames,
  ) {}

  instituteName(workspaceId: string): Promise<string> {
    return this.names.workspaceName(workspaceId);
  }

  userNames(userIds: readonly string[]): Promise<Map<string, string>> {
    return this.names.displayNames([...new Set(userIds)]);
  }

  async settings(workspaceId: string): Promise<ReportSettings> {
    const row = await this.db.trainingInstituteReportSettings.findUnique({
      where: { workspaceId },
    });
    return row == null
      ? { ...DEFAULT_REPORT_SETTINGS }
      : {
          thresholdPercent: row.thresholdPercent,
          absentInARow: row.absentInARow,
          minimumClasses: row.minimumClasses,
          academicYearStartMonth: row.academicYearStartMonth,
        };
  }

  async saveSettings(
    workspaceId: string,
    settings: ReportSettings,
    userId: string,
  ): Promise<void> {
    await this.db.trainingInstituteReportSettings.upsert({
      where: { workspaceId },
      create: { workspaceId, ...settings, updatedByUserId: userId },
      update: { ...settings, updatedByUserId: userId },
    });
  }

  async activeTeacher(workspaceId: string, userId: string) {
    const row = await this.db.trainingInstituteTeacher.findFirst({
      where: { workspaceId, userId, deletedAt: null, deactivatedAt: null },
      select: { id: true, name: true },
    });
    return row ?? null;
  }

  async familyStudentIds(
    workspaceId: string,
    role: "student" | "parent",
    verifiedEmails: readonly string[],
  ): Promise<string[]> {
    const emails = familyEmails(verifiedEmails);
    if (emails.size === 0) return [];
    const rows = await this.db.trainingInstituteStudent.findMany({
      where: { workspaceId, deletedAt: null },
      select: { id: true, email: true, profileDetails: true, name: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    return rows
      .filter((row) => isLinkedStudent(row, role, emails))
      .map((row) => row.id);
  }

  async structure(workspaceId: string): Promise<ReportStructure> {
    const [courses, batches, students, enrollments, teachers, assignments] =
      await Promise.all([
        this.db.trainingInstituteCourse.findMany({
          where: { workspaceId, deletedAt: null },
          select: { id: true, name: true, archivedAt: true },
        }),
        this.db.trainingInstituteBatch.findMany({
          where: { workspaceId, deletedAt: null },
          include: { course: { select: { name: true } } },
        }),
        this.db.trainingInstituteStudent.findMany({
          where: { workspaceId, deletedAt: null },
          select: {
            id: true,
            name: true,
            phone: true,
            guardianPhone: true,
            profileDetails: true,
            createdAt: true,
            droppedAt: true,
          },
        }),
        this.db.trainingInstituteEnrollment.findMany({
          where: { workspaceId, deletedAt: null, student: { deletedAt: null } },
          include: { batch: { select: { timings: true, classMode: true } } },
        }),
        this.db.trainingInstituteTeacher.findMany({
          where: { workspaceId, deletedAt: null },
          select: {
            id: true,
            name: true,
            kind: true,
            userId: true,
            deactivatedAt: true,
          },
        }),
        this.db.trainingInstituteBatchTeacherAssignment.findMany({
          where: { workspaceId, deletedAt: null, teacher: { deletedAt: null } },
          select: {
            teacherId: true,
            batchId: true,
            assignedAt: true,
            unassignedAt: true,
          },
        }),
      ]);
    const exceptions = await new PrismaClassExceptionsReader(
      this.db,
    ).forBatches(
      workspaceId,
      batches.map((batch) => batch.id),
    );
    return {
      courses: courses.map((course) => ({
        id: course.id,
        name: course.name,
        archived: course.archivedAt != null,
      })),
      batches: batches.map((batch) => ({
        id: batch.id,
        name: batch.name,
        courseId: batch.courseId,
        courseName: batch.course.name,
        classMode: batch.classMode,
        capacity: batch.capacity,
        room: batch.room,
        timings: batch.timings as unknown as WeeklySlot[],
        timezone: batch.timezone,
        meetingOption: batch.meetingOption,
        closedAt: batch.closedAt,
        createdAt: batch.createdAt,
      })),
      students: students.map((student): ReportStudent => ({
        id: student.id,
        name: student.name,
        contactPhone: contactPhone(student),
        createdAt: student.createdAt,
        droppedAt: student.droppedAt,
        parentEmails: parentEmails(student.profileDetails),
      })),
      enrollments: enrollments.map((enrollment): ReportEnrollment => ({
        id: enrollment.id,
        studentId: enrollment.studentId,
        batchId: enrollment.batchId,
        courseId: enrollment.courseId,
        classMode: enrollment.classModeOverride ?? enrollment.batch.classMode,
        timingSource: enrollment.timingSource,
        timings:
          enrollment.timingSource === "student" &&
          Array.isArray(enrollment.studentTimings)
            ? (enrollment.studentTimings as unknown as WeeklySlot[])
            : (enrollment.batch.timings as unknown as WeeklySlot[]),
        createdAt: enrollment.createdAt,
        endedAt: enrollment.endedAt,
        feePlan: {
          type: enrollment.feePlanType,
          amountPaise: enrollment.feePlanAmountPaise,
          concessionPaise: enrollment.feePlanConcessionPaise,
          installmentCount: enrollment.feePlanInstallmentCount,
          dueDates: enrollment.feePlanDueDates as unknown as FeePlanDueDate[],
        },
      })),
      teachers,
      assignments,
      changes: exceptions.changes,
      holidays: exceptions.holidays,
    };
  }

  async marks(workspaceId: string, range: DateRange) {
    const rows = await this.db.trainingInstituteAttendanceMark.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        register: {
          deletedAt: null,
          date: { gte: dateValue(range.from), lte: dateValue(range.to) },
        },
      },
      select: {
        enrollmentId: true,
        studentId: true,
        status: true,
        note: true,
        markedAt: true,
        markedByUserId: true,
        register: { select: { batchId: true, date: true } },
      },
    });
    return rows.map((row) => ({
      batchId: row.register.batchId,
      date: day(row.register.date),
      enrollmentId: row.enrollmentId,
      studentId: row.studentId,
      status: row.status,
      note: row.note,
      markedAt: row.markedAt,
      markedByUserId: row.markedByUserId,
    }));
  }

  async occurrences(workspaceId: string, range: DateRange) {
    const rows = await this.db.trainingInstituteClassOccurrence.findMany({
      where: {
        workspaceId,
        classDate: { gte: dateValue(range.from), lte: dateValue(range.to) },
      },
      include: {
        joins: { select: { enrollmentId: true, firstJoinedAt: true } },
      },
    });
    const enrollmentIds = [
      ...new Set(
        rows.flatMap((row) => row.joins.map((join) => join.enrollmentId)),
      ),
    ];
    const students = new Map(
      (enrollmentIds.length === 0
        ? []
        : await this.db.trainingInstituteEnrollment.findMany({
            where: { workspaceId, id: { in: enrollmentIds } },
            select: { id: true, studentId: true },
          })
      ).map((row) => [row.id, row.studentId]),
    );
    return rows.map((row) => ({
      batchId: row.batchId,
      date: day(row.classDate),
      startTime: row.startTime,
      endTime: row.endTime,
      status: row.status as "starting" | "live" | "ended" | "failed",
      recordingStatus: row.recordingStatus as
        | "pending"
        | "requesting"
        | "recording"
        | "uploading"
        | "ready"
        | "error",
      startedByUserId: row.startedByUserId,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      joins: row.joins.map((join) => ({
        enrollmentId: join.enrollmentId,
        studentId: students.get(join.enrollmentId) ?? "",
        joinedAt: join.firstJoinedAt,
      })),
    }));
  }

  async notices(workspaceId: string, range: DateRange) {
    const rows = await this.db.trainingInstituteAbsenceNotice.findMany({
      where: {
        workspaceId,
        withdrawnAt: null,
        classDate: { gte: dateValue(range.from), lte: dateValue(range.to) },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      studentId: row.studentId,
      enrollmentId: row.enrollmentId,
      batchId: row.batchId,
      date: day(row.classDate),
      startTime: row.startTime,
      reason: row.reason,
      givenByRole: row.givenByRole,
      givenByName: row.givenByName,
      givenAt: row.givenAt,
    }));
  }

  async payments(workspaceId: string) {
    return this.db.trainingInstituteFeePayment.findMany({
      where: { workspaceId, deletedAt: null, enrollment: { deletedAt: null } },
      select: {
        id: true,
        enrollmentId: true,
        amountPaise: true,
        method: true,
        paidAt: true,
        receiptNumber: true,
        recordedByUserId: true,
      },
    });
  }

  async followUps(workspaceId: string) {
    const rows = await this.db.trainingInstituteFeeFollowUp.findMany({
      where: { workspaceId },
      select: {
        enrollmentId: true,
        channel: true,
        createdAt: true,
        nextFollowUpOn: true,
        closedAt: true,
      },
    });
    return rows.map((row) => ({
      enrollmentId: row.enrollmentId,
      channel: row.channel,
      loggedAt: row.createdAt,
      nextFollowUpOn:
        row.nextFollowUpOn == null ? null : day(row.nextFollowUpOn),
      open: row.closedAt == null,
    }));
  }

  async enquiries(workspaceId: string): Promise<ReportEnquiry[]> {
    const rows = await this.db.trainingInstituteEnquiry.findMany({
      where: { workspaceId, deletedAt: null },
      include: {
        source: { select: { name: true, retiredAt: true } },
        _count: { select: { activities: { where: { kind: "follow_up" } } } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      prospectName: row.prospectName,
      createdAt: row.createdAt,
      createdByUserId: row.createdByUserId,
      courseId: row.courseId,
      subject: row.subject,
      preferredClassMode: row.preferredClassMode,
      sourceId: row.sourceId,
      sourceName: row.source?.name ?? null,
      sourceRetired: row.source?.retiredAt != null,
      stage: row.stage,
      notInterestedReason: row.notInterestedReason,
      closedAt: row.closedAt,
      convertedAt: row.convertedAt,
      convertedStudentId: row.convertedStudentId,
      nextFollowUpOn:
        row.nextFollowUpOn == null ? null : day(row.nextFollowUpOn),
      followUps: row._count.activities,
    }));
  }

  async demos(workspaceId: string): Promise<ReportDemo[]> {
    const rows = await this.db.trainingInstituteEnquiryDemo.findMany({
      where: { workspaceId, enquiry: { deletedAt: null } },
      include: { enquiry: { select: { prospectName: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      enquiryId: row.enquiryId,
      prospectName: row.enquiry.prospectName,
      kind: row.kind,
      batchId: row.batchId,
      teacherId: row.teacherId,
      date: day(row.demoDate),
      startTime: row.startTime,
      endTime: row.endTime,
      feeKind: row.feeKind,
      feeAmountPaise: row.feeAmountPaise,
      feePaidAt: row.feePaidAt,
      attendance: row.attendance,
      cancelledAt: row.cancelledAt,
    }));
  }

  async tests(workspaceId: string, range: DateRange): Promise<ReportTest[]> {
    const rows = await this.db.trainingInstituteClassTest.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        publishedAt: { not: null },
        heldOn: { gte: dateValue(range.from), lte: dateValue(range.to) },
      },
      include: {
        results: {
          include: { changes: { orderBy: { changedAt: "asc" } } },
        },
      },
    });
    const number = (value: { toNumber(): number } | null) =>
      value == null ? null : value.toNumber();
    return rows.map((row) => ({
      id: row.id,
      batchId: row.batchId,
      scope: row.scope,
      studentId: row.studentId,
      name: row.name,
      heldOn: day(row.heldOn),
      maxMarks: row.maxMarks,
      passMarks: row.passMarks,
      topic: row.topic,
      results: row.results.map((result) => ({
        studentId: result.studentId,
        status: result.status,
        marks: number(result.marks),
        remark: result.remark,
        changes: result.changes.map((change) => ({
          oldStatus: change.oldStatus,
          newStatus: change.newStatus,
          oldMarks: number(change.oldMarks),
          newMarks: number(change.newMarks),
          changedAt: change.changedAt,
          changedByUserId: change.changedByUserId,
        })),
      })),
    }));
  }

  async homework(workspaceId: string, range: DateRange) {
    const rows = await this.db.trainingInstituteHomework.findMany({
      where: {
        workspaceId,
        dueOn: { gte: dateValue(range.from), lte: dateValue(range.to) },
      },
      include: {
        submissions: {
          where: { withdrawnAt: null },
          select: {
            studentId: true,
            submittedAt: true,
            submittedByRole: true,
            checkedAt: true,
            remark: true,
          },
        },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      batchId: row.batchId,
      title: row.title,
      classDate: day(row.classDate),
      dueOn: day(row.dueOn),
      postedAt: row.createdAt,
      removedAt: row.removedAt,
      submissions: row.submissions,
    }));
  }

  async remarks(
    workspaceId: string,
    month: string,
    studentIds: readonly string[],
  ) {
    if (studentIds.length === 0) return [];
    const rows = await this.db.trainingInstituteMonthlyReportRemark.findMany({
      where: { workspaceId, month, studentId: { in: [...studentIds] } },
      orderBy: [{ createdAt: "asc" }],
    });
    return rows.map((row) => ({
      studentId: row.studentId,
      month: row.month,
      authorUserId: row.authorUserId,
      authorRole: row.authorRole,
      authorName: row.authorName,
      text: row.text,
      updatedAt: row.updatedAt,
    }));
  }

  async saveRemark(
    input: Parameters<ReportSource["saveRemark"]>[0],
  ): Promise<void> {
    const key = {
      workspaceId_studentId_month_authorUserId: {
        workspaceId: input.workspaceId,
        studentId: input.studentId,
        month: input.month,
        authorUserId: input.authorUserId,
      },
    };
    if (input.text == null) {
      await this.db.trainingInstituteMonthlyReportRemark.deleteMany({
        where: key.workspaceId_studentId_month_authorUserId,
      });
      return;
    }
    await this.db.trainingInstituteMonthlyReportRemark.upsert({
      where: key,
      create: {
        id: crypto.randomUUID(),
        workspaceId: input.workspaceId,
        studentId: input.studentId,
        month: input.month,
        authorUserId: input.authorUserId,
        authorRole: input.authorRole,
        authorName: input.authorName,
        text: input.text,
        createdAt: input.now,
      },
      update: { text: input.text, authorName: input.authorName },
    });
  }
}
