import type { Student } from "../domain/student";
import type { EnrollmentReadModel } from "./enrollment-read-model";

export type StudentReadModel = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  photoUrl: string | null;
  address: string | null;
  idProofNote: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  droppedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string;
  enrollments: EnrollmentReadModel[];
};

export function toStudentReadModel(
  student: Student,
  enrollments: EnrollmentReadModel[] = [],
): StudentReadModel {
  return {
    id: student.id.value,
    name: student.name.value,
    phone: student.phone.value,
    email: student.email?.value ?? null,
    photoUrl: student.photoUrl?.value ?? null,
    address: student.address?.value ?? null,
    idProofNote: student.idProofNote?.value ?? null,
    guardianName: student.guardianName?.value ?? null,
    guardianPhone: student.guardianPhone?.value ?? null,
    droppedAt: student.droppedAt,
    createdAt: student.createdAt,
    updatedAt: student.updatedAt,
    createdByUserId: student.createdByUserId.value,
    enrollments,
  };
}
