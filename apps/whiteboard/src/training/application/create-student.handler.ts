import { Student, StudentProfile } from "../domain/student";
import { StudentId } from "../domain/student-id";
import { DomainError } from "../domain/errors";
import type { StudentRepository } from "../domain/student-repository";
import { UserId } from "../domain/user-id";
import { WorkspaceId } from "../domain/workspace-id";
import type { CreateStudentCommand } from "./create-student.command";
import type { EventDispatcher } from "./event-dispatcher";
import { StudentNotFoundError } from "./not-found-error";
import {
  toStudentReadModel,
  type StudentReadModel,
} from "./student-read-model";

export class CreateStudentHandler {
  constructor(
    private readonly students: StudentRepository,
    private readonly events: EventDispatcher,
  ) {}

  async execute(command: CreateStudentCommand): Promise<StudentReadModel> {
    const now = new Date();
    const student = Student.create({
      id: StudentId.create(command.requestId ?? crypto.randomUUID()),
      workspaceId: WorkspaceId.create(command.workspaceId),
      createdByUserId: UserId.create(command.createdByUserId),
      profile: StudentProfile.fromRaw(command),
      now,
    });
    const created = await this.students.create(student);
    if (!created) {
      const existing = await this.students.findByIdInWorkspace(
        student.id,
        student.workspaceId,
      );
      if (existing == null) throw new StudentNotFoundError();
      const sameCreator =
        existing.createdByUserId.value === student.createdByUserId.value;
      const sameProfile = sameStudentProfile(existing, student);
      if (!sameCreator || !sameProfile) {
        throw new DomainError(
          "STUDENT_REQUEST_CONFLICT",
          "This Student request ID was already used for different details.",
        );
      }
      return toStudentReadModel(existing);
    }
    await this.events.dispatch(student.pullDomainEvents());
    return toStudentReadModel(student);
  }
}

function sameStudentProfile(a: Student, b: Student): boolean {
  const profile = (student: Student) => ({
    name: student.name.value,
    phone: student.phone.value,
    email: student.email?.value ?? null,
    photoUrl: student.photoUrl?.value ?? null,
    address: student.address?.value ?? null,
    idProofNote: student.idProofNote?.value ?? null,
    guardianName: student.guardianName?.value ?? null,
    guardianPhone: student.guardianPhone?.value ?? null,
    details: student.details,
  });
  return JSON.stringify(profile(a)) === JSON.stringify(profile(b));
}
