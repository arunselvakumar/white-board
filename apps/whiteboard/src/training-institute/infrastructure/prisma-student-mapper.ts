import type { TrainingInstituteStudent as StudentRecord } from "@repo/db";

import { EmailAddress } from "../domain/email-address";
import { Phone } from "../domain/phone";
import { studentDetailsFromStored } from "../domain/student-details";
import {
  Student,
  studentAddress,
  studentGuardianName,
  studentIdProofNote,
  studentPhotoUrl,
} from "../domain/student";
import { StudentId } from "../domain/student-id";
import { StudentName } from "../domain/student-name";
import { UserId } from "../domain/user-id";
import { WorkspaceId } from "../domain/workspace-id";

export function toDomainStudent(row: StudentRecord): Student {
  return Student.reconstitute({
    id: StudentId.create(row.id),
    workspaceId: WorkspaceId.create(row.workspaceId),
    createdByUserId: UserId.create(row.createdByUserId),
    name: StudentName.create(row.name),
    phone: Phone.create(row.phone),
    email: EmailAddress.create(row.email),
    photoUrl: studentPhotoUrl(row.photoUrl),
    address: studentAddress(row.address),
    idProofNote: studentIdProofNote(row.idProofNote),
    guardianName: studentGuardianName(row.guardianName),
    guardianPhone: Phone.createOptional(row.guardianPhone),
    details: studentDetailsFromStored(row.profileDetails, {
      guardianName: row.guardianName,
      guardianPhone: row.guardianPhone,
    }),
    droppedAt: row.droppedAt,
    droppedByUserId:
      row.droppedByUserId == null ? null : UserId.create(row.droppedByUserId),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    deletedByUserId:
      row.deletedByUserId == null ? null : UserId.create(row.deletedByUserId),
  });
}
