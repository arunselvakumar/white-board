import type { EnrollmentReadModel } from "@/src/training/application/enrollment-read-model";

export function mapEnrollmentResponse(enrollment: EnrollmentReadModel) {
  return {
    id: enrollment.id,
    studentId: enrollment.studentId,
    courseId: enrollment.courseId,
    batchId: enrollment.batchId,
    classModeOverride: enrollment.classModeOverride,
    timingSource: enrollment.timingSource,
    studentTimings: enrollment.studentTimings,
    endedAt: enrollment.endedAt?.toISOString() ?? null,
    feePlanType: enrollment.feePlanType,
    feePlanAmountPaise: enrollment.feePlanAmountPaise,
    feePlanConcessionPaise: enrollment.feePlanConcessionPaise,
    feePlanInstallmentCount: enrollment.feePlanInstallmentCount,
    feePlanDueDates: enrollment.feePlanDueDates,
    remainingDuesPaise: enrollment.remainingDuesPaise,
    createdAt: enrollment.createdAt.toISOString(),
    updatedAt: enrollment.updatedAt.toISOString(),
    createdByUserId: enrollment.createdByUserId,
  };
}
