import type { Enrollment } from "../domain/enrollment";
import type { WeeklySlot } from "../domain/weekly-timings";

export type EnrollmentReadModel = {
  id: string;
  studentId: string;
  courseId: string;
  batchId: string;
  classModeOverride: string | null;
  timingSource: string;
  studentTimings: WeeklySlot[] | null;
  endedAt: Date | null;
  feePlanType: string;
  feePlanAmountPaise: number;
  feePlanConcessionPaise: number;
  feePlanInstallmentCount: number | null;
  feePlanDueDates: { dueOn: string; amountPaise: number }[];
  remainingDuesPaise: number;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string;
};

export function toEnrollmentReadModel(
  enrollment: Enrollment,
  paidPaise = 0,
): EnrollmentReadModel {
  const plan = enrollment.feePlan.toJson();
  return {
    id: enrollment.id.value,
    studentId: enrollment.studentId.value,
    courseId: enrollment.courseId.value,
    batchId: enrollment.batchId.value,
    classModeOverride: enrollment.classModeOverride?.value ?? null,
    timingSource: enrollment.timingSource.value,
    studentTimings: enrollment.studentTimings?.toJson() ?? null,
    endedAt: enrollment.endedAt,
    feePlanType: plan.type,
    feePlanAmountPaise: plan.amountPaise,
    feePlanConcessionPaise: plan.concessionPaise,
    feePlanInstallmentCount: plan.installmentCount,
    feePlanDueDates: plan.dueDates,
    remainingDuesPaise: enrollment.feePlan.remainingDues(paidPaise).value,
    createdAt: enrollment.createdAt,
    updatedAt: enrollment.updatedAt,
    createdByUserId: enrollment.createdByUserId.value,
  };
}
