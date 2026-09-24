import { Student, StudentProfile } from "../domain/student";
import { StudentId } from "../domain/student-id";
import type { StudentRepository } from "../domain/student-repository";
import { UserId } from "../domain/user-id";
import { WorkspaceId } from "../domain/workspace-id";
import type { CreateStudentCommand } from "./create-student.command";
import type { EventDispatcher } from "./event-dispatcher";
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
      id: StudentId.create(crypto.randomUUID()),
      workspaceId: WorkspaceId.create(command.workspaceId),
      createdByUserId: UserId.create(command.createdByUserId),
      profile: StudentProfile.fromRaw(command),
      now,
    });
    await this.students.save(student);
    await this.events.dispatch(student.pullDomainEvents());
    return toStudentReadModel(student);
  }
}
