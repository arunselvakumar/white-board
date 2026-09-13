import type { EnrollmentReadModel } from "@/src/training/application/enrollment-read-model";
import type { StudentReadModel } from "@/src/training/application/student-read-model";

function mapEnrollmentSummary(enrollment: EnrollmentReadModel) {
  return {
    id: enrollment.id,
    courseId: enrollment.courseId,
    batchId: enrollment.batchId,
    classModeOverride: enrollment.classModeOverride,
    timingSource: enrollment.timingSource,
    endedAt: enrollment.endedAt?.toISOString() ?? null,
    feePlanAmountPaise: enrollment.feePlanAmountPaise,
    remainingDuesPaise: enrollment.remainingDuesPaise,
  };
}

export function mapStudentResponse(student: StudentReadModel) {
  return {
    id: student.id,
    name: student.name,
    phone: student.phone,
    email: student.email,
    photoUrl: student.photoUrl,
    address: student.address,
    idProofNote: student.idProofNote,
    guardianName: student.guardianName,
    guardianPhone: student.guardianPhone,
    droppedAt: student.droppedAt?.toISOString() ?? null,
    createdAt: student.createdAt.toISOString(),
    updatedAt: student.updatedAt.toISOString(),
    createdByUserId: student.createdByUserId,
  };
}

export function mapGetStudentResponse(student: StudentReadModel) {
  return {
    ...mapStudentResponse(student),
    enrollments: student.enrollments.map(mapEnrollmentSummary),
  };
}
