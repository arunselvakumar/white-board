import { StudentId } from "../domain/student-id";
import type { StudentRepository } from "../domain/student-repository";
import { UserId } from "../domain/user-id";
import { WorkspaceId } from "../domain/workspace-id";
import type { DropStudentCommand } from "./drop-student.command";
import type { EventDispatcher } from "./event-dispatcher";
import { StudentNotFoundError } from "./not-found-error";
import {
  toStudentReadModel,
  type StudentReadModel,
} from "./student-read-model";

export class DropStudentHandler {
  constructor(
    private readonly students: StudentRepository,
    private readonly events: EventDispatcher,
  ) {}

  async execute(command: DropStudentCommand): Promise<StudentReadModel> {
    const student = await this.students.findByIdInWorkspace(
      StudentId.create(command.id),
      WorkspaceId.create(command.workspaceId),
    );
    if (student == null) {
      throw new StudentNotFoundError();
    }
    student.drop(UserId.create(command.droppedByUserId), new Date());
    await this.students.save(student);
    await this.events.dispatch(student.pullDomainEvents());
    return toStudentReadModel(student);
  }
}
