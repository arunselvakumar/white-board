import { StudentId } from "../domain/student-id";
import { StudentProfile } from "../domain/student";
import type { StudentRepository } from "../domain/student-repository";
import { WorkspaceId } from "../domain/workspace-id";
import type { EventDispatcher } from "./event-dispatcher";
import { StudentNotFoundError } from "./not-found-error";
import {
  toStudentReadModel,
  type StudentReadModel,
} from "./student-read-model";
import type { UpdateStudentProfileCommand } from "./update-student-profile.command";

export class UpdateStudentProfileHandler {
  constructor(
    private readonly students: StudentRepository,
    private readonly events: EventDispatcher,
  ) {}

  async execute(
    command: UpdateStudentProfileCommand,
  ): Promise<StudentReadModel> {
    const student = await this.students.findByIdInWorkspace(
      StudentId.create(command.id),
      WorkspaceId.create(command.workspaceId),
    );
    if (student == null) {
      throw new StudentNotFoundError();
    }
    student.updateProfile(StudentProfile.fromRaw(command), new Date());
    await this.students.save(student);
    await this.events.dispatch(student.pullDomainEvents());
    return toStudentReadModel(student);
  }
}
