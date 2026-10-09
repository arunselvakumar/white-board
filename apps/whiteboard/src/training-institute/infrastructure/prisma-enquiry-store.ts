import { Prisma, type PrismaClient } from "@repo/whiteboard-db";

import type { ChangeableBatch } from "../application/class-change-handlers";
import type { EnquiryStore } from "../application/enquiry-ports";
import type { Batch } from "../domain/batch";
import type { ClassChangeFact, HolidayFact } from "../domain/class-schedule";
import type { Course } from "../domain/course";
import { Demo } from "../domain/demo";
import { Enquiry } from "../domain/enquiry";
import {
  EnquirySource,
  enquirySourceNameInUse,
} from "../domain/enquiry-source";
import type { Enrollment } from "../domain/enrollment";
import { DomainError } from "../domain/errors";
import type { Student } from "../domain/student";
import { PrismaClassChangeStore } from "./prisma-class-change-store";
import { toDomainBatch } from "./prisma-batch-mapper";
import { toDomainCourse } from "./prisma-course-mapper";
import { lockBatchSchedule } from "./schedule-locks";

type Db = PrismaClient | Prisma.TransactionClient;

export const dateValue = (date: string) => new Date(`${date}T00:00:00.000Z`);
export const dateKey = (date: Date) => date.toISOString().slice(0, 10);

type EnquiryRow = Prisma.TrainingInstituteEnquiryGetPayload<object>;
type DemoRow = Prisma.TrainingInstituteEnquiryDemoGetPayload<object>;
type SourceRow = Prisma.TrainingInstituteEnquirySourceGetPayload<object>;

export function toDemo(row: DemoRow): Demo {
  return Demo.rehydrate({
    id: row.id,
    workspaceId: row.workspaceId,
    enquiryId: row.enquiryId,
    kind: row.kind,
    batchId: row.batchId,
    teacherId: row.teacherId,
    date: dateKey(row.demoDate),
    startTime: row.startTime,
    endTime: row.endTime,
    timezone: row.timezone,
    feeKind: row.feeKind,
    feeAmountPaise: row.feeAmountPaise,
    feePaidAt: row.feePaidAt,
    feePaidByUserId: row.feePaidByUserId,
    attendance: row.attendance,
    attendanceMarkedAt: row.attendanceMarkedAt,
    attendanceMarkedByUserId: row.attendanceMarkedByUserId,
    cancelledAt: row.cancelledAt,
    cancelledByUserId: row.cancelledByUserId,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function toSource(row: SourceRow): EnquirySource {
  return EnquirySource.rehydrate({
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    retiredAt: row.retiredAt,
    retiredByUserId: row.retiredByUserId,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function toEnquiry(
  row: EnquiryRow,
  demos: DemoRow[],
  hasFollowUp: boolean,
): Enquiry {
  return Enquiry.rehydrate({
    id: row.id,
    workspaceId: row.workspaceId,
    createdByUserId: row.createdByUserId,
    details: {
      prospectName: row.prospectName,
      phone: row.phone,
      email: row.email,
      guardianName: row.guardianName,
      guardianPhone: row.guardianPhone,
      courseId: row.courseId,
      subject: row.subject,
      preferredClassMode: row.preferredClassMode,
      preferredTiming: row.preferredTiming,
      sourceId: row.sourceId,
      notes: row.notes,
    },
    stage: row.stage,
    nextFollowUpOn:
      row.nextFollowUpOn == null ? null : dateKey(row.nextFollowUpOn),
    notInterestedReason: row.notInterestedReason,
    closedAt: row.closedAt,
    closedByUserId: row.closedByUserId,
    convertedStudentId: row.convertedStudentId,
    convertedEnrollmentId: row.convertedEnrollmentId,
    convertedAt: row.convertedAt,
    convertedByUserId: row.convertedByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    demos: demos.map((demo) => toDemo(demo).toStageFact()),
    hasFollowUp,
  });
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export class PrismaEnquiryStore implements EnquiryStore {
  constructor(private readonly db: Db) {}

  private get schedule(): PrismaClassChangeStore {
    return new PrismaClassChangeStore(this.db);
  }

  transaction<T>(work: (store: EnquiryStore) => Promise<T>): Promise<T> {
    if (!("$transaction" in this.db)) return work(this);
    return this.db.$transaction((tx) => work(new PrismaEnquiryStore(tx)));
  }

  async lockEnquiry(workspaceId: string, id: string): Promise<Enquiry | null> {
    const locked = await this.db.$queryRaw<{ id: string }[]>`
      SELECT id FROM training_institute.enquiries
      WHERE id = ${id}::uuid
        AND workspace_id = ${workspaceId}
        AND deleted_at IS NULL
      FOR UPDATE`;
    if (locked.length === 0) return null;
    const [row, demos, followUp] = await Promise.all([
      this.db.trainingInstituteEnquiry.findFirst({
        where: { id, workspaceId, deletedAt: null },
      }),
      this.db.trainingInstituteEnquiryDemo.findMany({
        where: { enquiryId: id, workspaceId },
      }),
      this.db.trainingInstituteEnquiryActivity.findFirst({
        where: { enquiryId: id, workspaceId, kind: "follow_up" },
        select: { id: true },
      }),
    ]);
    return row == null ? null : toEnquiry(row, demos, followUp != null);
  }

  async saveEnquiry(enquiry: Enquiry): Promise<void> {
    const props = enquiry.toProps();
    const { details } = props;
    const data = {
      prospectName: details.prospectName,
      phone: details.phone,
      email: details.email,
      guardianName: details.guardianName,
      guardianPhone: details.guardianPhone,
      courseId: details.courseId,
      subject: details.subject,
      preferredClassMode: details.preferredClassMode,
      preferredTiming: details.preferredTiming,
      sourceId: details.sourceId,
      notes: details.notes,
      stage: props.stage,
      nextFollowUpOn:
        props.nextFollowUpOn == null ? null : dateValue(props.nextFollowUpOn),
      notInterestedReason: props.notInterestedReason,
      closedAt: props.closedAt,
      closedByUserId: props.closedByUserId,
      convertedStudentId: props.convertedStudentId,
      convertedEnrollmentId: props.convertedEnrollmentId,
      convertedAt: props.convertedAt,
      convertedByUserId: props.convertedByUserId,
      updatedAt: props.updatedAt,
    };
    await this.db.trainingInstituteEnquiry.upsert({
      where: { id: props.id },
      create: {
        id: props.id,
        workspaceId: props.workspaceId,
        createdByUserId: props.createdByUserId,
        createdAt: props.createdAt,
        ...data,
      },
      update: data,
    });
    const activities = enquiry.pullActivities();
    if (activities.length > 0)
      await this.db.trainingInstituteEnquiryActivity.createMany({
        data: activities.map((activity) => ({
          id: activity.id,
          workspaceId: props.workspaceId,
          enquiryId: props.id,
          kind: activity.kind,
          note: activity.note,
          nextFollowUpOn:
            activity.nextFollowUpOn == null
              ? null
              : dateValue(activity.nextFollowUpOn),
          createdByUserId: activity.createdByUserId,
          createdAt: activity.createdAt,
        })),
      });
  }

  async demosOf(workspaceId: string, enquiryId: string): Promise<Demo[]> {
    const rows = await this.db.trainingInstituteEnquiryDemo.findMany({
      where: { workspaceId, enquiryId },
      orderBy: [{ demoDate: "asc" }, { startTime: "asc" }],
    });
    return rows.map(toDemo);
  }

  async findDemo(workspaceId: string, id: string): Promise<Demo | null> {
    const row = await this.db.trainingInstituteEnquiryDemo.findFirst({
      where: { id, workspaceId, enquiry: { deletedAt: null } },
    });
    return row == null ? null : toDemo(row);
  }

  async saveDemo(demo: Demo): Promise<void> {
    const props = demo.toProps();
    const data = {
      feePaidAt: props.feePaidAt,
      feePaidByUserId: props.feePaidByUserId,
      attendance: props.attendance,
      attendanceMarkedAt: props.attendanceMarkedAt,
      attendanceMarkedByUserId: props.attendanceMarkedByUserId,
      cancelledAt: props.cancelledAt,
      cancelledByUserId: props.cancelledByUserId,
      updatedAt: props.updatedAt,
    };
    await this.db.trainingInstituteEnquiryDemo.upsert({
      where: { id: props.id },
      create: {
        id: props.id,
        workspaceId: props.workspaceId,
        enquiryId: props.enquiryId,
        kind: props.kind,
        batchId: props.batchId,
        teacherId: props.teacherId,
        demoDate: dateValue(props.date),
        startTime: props.startTime,
        endTime: props.endTime,
        timezone: props.timezone,
        feeKind: props.feeKind,
        feeAmountPaise: props.feeAmountPaise,
        createdByUserId: props.createdByUserId,
        createdAt: props.createdAt,
        ...data,
      },
      update: data,
    });
  }

  async findSource(
    workspaceId: string,
    id: string,
  ): Promise<EnquirySource | null> {
    const row = await this.db.trainingInstituteEnquirySource.findFirst({
      where: { id, workspaceId },
    });
    return row == null ? null : toSource(row);
  }

  async saveSource(source: EnquirySource): Promise<void> {
    const props = source.toProps();
    const data = {
      name: props.name,
      retiredAt: props.retiredAt,
      retiredByUserId: props.retiredByUserId,
      updatedAt: props.updatedAt,
    };
    try {
      await this.db.trainingInstituteEnquirySource.upsert({
        where: { id: props.id },
        create: {
          id: props.id,
          workspaceId: props.workspaceId,
          createdByUserId: props.createdByUserId,
          createdAt: props.createdAt,
          ...data,
        },
        update: data,
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw enquirySourceNameInUse();
      throw error;
    }
  }

  async activeSourceNameTaken(
    workspaceId: string,
    name: string,
    exceptId: string | null,
  ): Promise<boolean> {
    const rows = await this.db.$queryRaw<{ id: string }[]>`
      SELECT id FROM training_institute.enquiry_sources
      WHERE workspace_id = ${workspaceId}
        AND retired_at IS NULL
        AND lower(name) = lower(${name.trim()})
        ${exceptId == null ? Prisma.empty : Prisma.sql`AND id <> ${exceptId}::uuid`}
      LIMIT 1`;
    return rows.length > 0;
  }

  async findCourse(
    workspaceId: string,
    id: string,
  ): Promise<{ archived: boolean } | null> {
    const row = await this.db.trainingInstituteCourse.findFirst({
      where: { id, workspaceId, deletedAt: null },
      select: { archivedAt: true },
    });
    return row == null ? null : { archived: row.archivedAt != null };
  }

  async lockBatchSchedule(workspaceId: string, batchId: string): Promise<void> {
    await lockBatchSchedule(this.db, workspaceId, batchId);
  }

  async lockTeacher(
    workspaceId: string,
    teacherId: string,
  ): Promise<{ active: boolean } | null> {
    const rows = await this.db.$queryRaw<{ deactivated_at: Date | null }[]>`
      SELECT deactivated_at FROM training_institute.teachers
      WHERE id = ${teacherId}::uuid
        AND workspace_id = ${workspaceId}
        AND deleted_at IS NULL
      FOR UPDATE`;
    const row = rows[0];
    return row == null ? null : { active: row.deactivated_at == null };
  }

  findScheduleBatch(
    workspaceId: string,
    batchId: string,
  ): Promise<ChangeableBatch | null> {
    return this.schedule.findBatch(workspaceId, batchId);
  }

  async classExceptions(
    workspaceId: string,
    batchId: string,
  ): Promise<{ changes: ClassChangeFact[]; holidays: HolidayFact[] }> {
    const [changes, holidays] = await Promise.all([
      this.schedule.activeChanges(workspaceId, batchId),
      this.schedule.activeHolidays(workspaceId),
    ]);
    return {
      changes: changes.map((change) => change.toFact()),
      holidays: holidays.map((holiday) => holiday.toFact()),
    };
  }

  async holidays(workspaceId: string): Promise<HolidayFact[]> {
    const holidays = await this.schedule.activeHolidays(workspaceId);
    return holidays.map((holiday) => holiday.toFact());
  }

  async teacherOneToOneDemos(
    workspaceId: string,
    teacherId: string,
    date: string,
  ): Promise<Demo[]> {
    const rows = await this.db.trainingInstituteEnquiryDemo.findMany({
      where: {
        workspaceId,
        teacherId,
        kind: "one_to_one",
        demoDate: dateValue(date),
        cancelledAt: null,
        enquiry: { deletedAt: null },
      },
    });
    return rows.map(toDemo);
  }

  async findEnrollmentBatch(
    workspaceId: string,
    batchId: string,
  ): Promise<Batch | null> {
    const row = await this.db.trainingInstituteBatch.findFirst({
      where: { id: batchId, workspaceId, deletedAt: null },
    });
    return row == null ? null : toDomainBatch(row);
  }

  async findEnrollmentCourse(
    workspaceId: string,
    courseId: string,
  ): Promise<Course | null> {
    const row = await this.db.trainingInstituteCourse.findFirst({
      where: { id: courseId, workspaceId, deletedAt: null },
    });
    return row == null ? null : toDomainCourse(row);
  }

  async admit(
    student: Student,
    enrollment: Enrollment,
    capacity: number,
  ): Promise<void> {
    // Same guard as Enroll Student: the Batch row lock serialises seat counts.
    await this.db.$queryRaw`
      SELECT id FROM training_institute.batches
      WHERE id = ${enrollment.batchId.value}::uuid
        AND workspace_id = ${enrollment.workspaceId.value}
        AND deleted_at IS NULL
      FOR UPDATE`;
    const occupied = await this.db.trainingInstituteEnrollment.count({
      where: {
        batchId: enrollment.batchId.value,
        workspaceId: enrollment.workspaceId.value,
        deletedAt: null,
        endedAt: null,
      },
    });
    if (occupied >= capacity)
      throw new DomainError("BATCH_AT_CAPACITY", "Batch is at capacity.");
    await this.db.trainingInstituteStudent.create({
      data: {
        id: student.id.value,
        workspaceId: student.workspaceId.value,
        createdByUserId: student.createdByUserId.value,
        name: student.name.value,
        phone: student.phone.value,
        email: student.email?.value ?? null,
        photoUrl: student.photoUrl?.value ?? null,
        address: student.address?.value ?? null,
        idProofNote: student.idProofNote?.value ?? null,
        guardianName: student.guardianName?.value ?? null,
        guardianPhone: student.guardianPhone?.value ?? null,
        profileDetails: student.details,
        createdAt: student.createdAt,
        updatedAt: student.updatedAt,
      },
    });
    const plan = enrollment.feePlan.toJson();
    await this.db.trainingInstituteEnrollment.create({
      data: {
        id: enrollment.id.value,
        workspaceId: enrollment.workspaceId.value,
        studentId: enrollment.studentId.value,
        courseId: enrollment.courseId.value,
        batchId: enrollment.batchId.value,
        createdByUserId: enrollment.createdByUserId.value,
        classModeOverride: enrollment.classModeOverride?.value ?? null,
        timingSource: enrollment.timingSource.value,
        studentTimings: enrollment.studentTimings
          ? (enrollment.studentTimings.toJson() as Prisma.InputJsonValue)
          : Prisma.DbNull,
        feePlanType: plan.type,
        feePlanAmountPaise: plan.amountPaise,
        feePlanConcessionPaise: plan.concessionPaise,
        feePlanInstallmentCount: plan.installmentCount,
        feePlanDueDates: plan.dueDates,
        createdAt: enrollment.createdAt,
        updatedAt: enrollment.updatedAt,
      },
    });
  }
}
