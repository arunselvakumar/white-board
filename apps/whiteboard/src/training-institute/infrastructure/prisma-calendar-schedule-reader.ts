import type { PrismaClient } from "@repo/db";

import type {
  CalendarItem,
  CalendarRole,
  CalendarScheduleReader,
} from "../application/calendar-schedule";
import { WeeklyTimings } from "../domain/weekly-timings";

type ProfileDetails = {
  father?: { email?: unknown };
  mother?: { email?: unknown };
  guardians?: { email?: unknown }[];
};

function normalizedEmail(value: unknown): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().toLowerCase()
    : null;
}

function matchesStudent(
  student: { email: string | null; profileDetails: unknown },
  role: CalendarRole,
  emails: Set<string>,
): boolean {
  if (role === "org:student")
    return emails.has(normalizedEmail(student.email) ?? "");
  const details = student.profileDetails as ProfileDetails | null;
  const contacts = [
    details?.father?.email,
    details?.mother?.email,
    ...(Array.isArray(details?.guardians)
      ? details.guardians.map((guardian) => guardian.email)
      : []),
  ];
  return contacts.some((email) => emails.has(normalizedEmail(email) ?? ""));
}

export class PrismaCalendarScheduleReader implements CalendarScheduleReader {
  constructor(private readonly db: PrismaClient) {}

  async execute(input: {
    workspaceId: string;
    userId: string;
    role: CalendarRole;
    verifiedEmails?: string[];
    includeClosed?: boolean;
  }): Promise<CalendarItem[]> {
    const workspaceId = input.workspaceId;
    if (input.role === "org:admin") {
      const batches = await this.db.trainingInstituteBatch.findMany({
        where: {
          workspaceId,
          deletedAt: null,
          ...(!input.includeClosed ? { closedAt: null } : {}),
          course: { deletedAt: null },
        },
        include: { course: { select: { name: true } } },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      });
      const homeTuition = await this.homeTuition(
        workspaceId,
        batches.map((batch) => batch.id),
      );
      return [
        ...batches.map((batch) => ({
          id: batch.id,
          batchId: batch.id,
          batchName: batch.name,
          courseId: batch.courseId,
          courseName: batch.course.name,
          studentName: null,
          classMode: batch.classMode,
          room: batch.room,
          joinUrl: batch.joinUrl,
          meetingOption: batch.meetingOption,
          timezone: batch.timezone,
          timings: WeeklyTimings.create(batch.timings).toJson(),
          activeFrom: batch.createdAt.toISOString(),
        })),
        ...homeTuition,
      ];
    }

    if (input.role === "org:teacher") {
      const assignments =
        await this.db.trainingInstituteBatchTeacherAssignment.findMany({
          where: {
            workspaceId,
            deletedAt: null,
            unassignedAt: null,
            teacher: {
              workspaceId,
              clerkUserId: input.userId,
              deletedAt: null,
              deactivatedAt: null,
            },
            batch: {
              workspaceId,
              deletedAt: null,
              ...(!input.includeClosed ? { closedAt: null } : {}),
              course: { deletedAt: null },
            },
          },
          include: {
            batch: { include: { course: { select: { name: true } } } },
          },
          orderBy: [{ batch: { name: "asc" } }, { id: "asc" }],
        });
      const homeTuition = await this.homeTuition(
        workspaceId,
        assignments.map(({ batch }) => batch.id),
      );
      return [
        ...assignments.map(({ batch }) => ({
          id: batch.id,
          batchId: batch.id,
          batchName: batch.name,
          courseId: batch.courseId,
          courseName: batch.course.name,
          studentName: null,
          classMode: batch.classMode,
          room: batch.room,
          joinUrl: batch.joinUrl,
          meetingOption: batch.meetingOption,
          timezone: batch.timezone,
          timings: WeeklyTimings.create(batch.timings).toJson(),
          activeFrom: batch.createdAt.toISOString(),
        })),
        ...homeTuition,
      ];
    }

    const emails = new Set(
      (input.verifiedEmails ?? [])
        .map(normalizedEmail)
        .filter((email): email is string => email != null),
    );
    if (emails.size === 0) return [];
    const students = await this.db.trainingInstituteStudent.findMany({
      where: { workspaceId, deletedAt: null, droppedAt: null },
      select: { id: true, email: true, profileDetails: true },
    });
    const studentIds = students
      .filter((student) => matchesStudent(student, input.role, emails))
      .map((student) => student.id);
    if (studentIds.length === 0) return [];
    const enrollments = await this.db.trainingInstituteEnrollment.findMany({
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
    });
    return enrollments.map(toEnrollmentItem);
  }

  /** Student-specific Classes (home tuition) in Batches the Owner or Teacher sees. */
  private async homeTuition(
    workspaceId: string,
    batchIds: string[],
  ): Promise<CalendarItem[]> {
    if (batchIds.length === 0) return [];
    const enrollments = await this.db.trainingInstituteEnrollment.findMany({
      where: {
        workspaceId,
        batchId: { in: batchIds },
        timingSource: "student",
        deletedAt: null,
        endedAt: null,
        student: { deletedAt: null, droppedAt: null },
      },
      include: {
        student: { select: { name: true } },
        batch: true,
        course: { select: { name: true } },
      },
      orderBy: [{ student: { name: "asc" } }, { id: "asc" }],
    });
    return enrollments.map(toEnrollmentItem);
  }
}

function toEnrollmentItem(enrollment: {
  id: string;
  batchId: string;
  courseId: string;
  createdAt: Date;
  classModeOverride: "offline" | "online" | "hybrid" | null;
  timingSource: "batch" | "student";
  studentTimings: unknown;
  student: { name: string };
  course: { name: string };
  batch: {
    name: string;
    classMode: "offline" | "online" | "hybrid";
    room: string | null;
    joinUrl: string | null;
    meetingOption: "external" | "whiteboard";
    timezone: string;
    timings: unknown;
  };
}): CalendarItem {
  return {
    id: enrollment.id,
    batchId: enrollment.batchId,
    batchName: enrollment.batch.name,
    courseId: enrollment.courseId,
    courseName: enrollment.course.name,
    studentName: enrollment.student.name,
    classMode: enrollment.classModeOverride ?? enrollment.batch.classMode,
    room: enrollment.batch.room,
    joinUrl: enrollment.batch.joinUrl,
    meetingOption: enrollment.batch.meetingOption,
    timezone: enrollment.batch.timezone,
    timings: WeeklyTimings.create(
      enrollment.timingSource === "student"
        ? enrollment.studentTimings
        : enrollment.batch.timings,
    ).toJson(),
    activeFrom: enrollment.createdAt.toISOString(),
  };
}
