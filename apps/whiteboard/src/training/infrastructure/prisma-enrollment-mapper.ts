import type { EnrollmentRecord } from "@repo/db";

import { ClassMode } from "../domain/class-mode";
import { CourseId } from "../domain/course-id";
import { Enrollment } from "../domain/enrollment";
import { EnrollmentId } from "../domain/enrollment-id";
import { FeePlan, type FeePlanDueDate } from "../domain/fee-plan";
import { BatchId } from "../domain/batch-id";
import { Paise } from "../domain/paise";
import { StudentId } from "../domain/student-id";
import { TimingSource } from "../domain/timing-source";
import { UserId } from "../domain/user-id";
import { WeeklyTimings } from "../domain/weekly-timings";
import { WorkspaceId } from "../domain/workspace-id";

export function toDomainEnrollment(row: EnrollmentRecord): Enrollment {
  return Enrollment.reconstitute({
    id: EnrollmentId.create(row.id),
    workspaceId: WorkspaceId.create(row.workspaceId),
    studentId: StudentId.create(row.studentId),
    courseId: CourseId.create(row.courseId),
    batchId: BatchId.create(row.batchId),
    createdByUserId: UserId.create(row.createdByUserId),
    classModeOverride:
      row.classModeOverride == null
        ? null
        : ClassMode.create(row.classModeOverride),
    timingSource: TimingSource.create(row.timingSource),
    studentTimings:
      row.studentTimings == null
        ? null
        : WeeklyTimings.create(row.studentTimings),
    endedAt: row.endedAt,
    endedByUserId:
      row.endedByUserId == null ? null : UserId.create(row.endedByUserId),
    feePlan: FeePlan.create({
      type: row.feePlanType,
      amount: Paise.create(row.feePlanAmountPaise),
      concession: Paise.create(row.feePlanConcessionPaise),
      installmentCount: row.feePlanInstallmentCount,
      dueDates: row.feePlanDueDates as FeePlanDueDate[],
    }),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    deletedByUserId:
      row.deletedByUserId == null ? null : UserId.create(row.deletedByUserId),
  });
}
