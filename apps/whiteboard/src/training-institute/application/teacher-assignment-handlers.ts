import { DomainError } from "../domain/errors";
import type {
  AssignedBatch,
  TeacherAssignmentRepository,
} from "../domain/teacher-assignment-repository";
import type { TeacherRepository } from "../domain/teacher-repository";
import { TeacherNotFoundError } from "./not-found-error";

export class TeacherAssignmentHandlers {
  constructor(
    private readonly teachers: TeacherRepository,
    private readonly assignments: TeacherAssignmentRepository,
  ) {}

  async list(teacherId: string, workspaceId: string): Promise<AssignedBatch[]> {
    const teacher = await this.teachers.findByIdInWorkspace(
      teacherId,
      workspaceId,
    );
    if (teacher == null) throw new TeacherNotFoundError();
    return this.assignments.listActive(teacherId, workspaceId);
  }

  async listForUser(
    userId: string,
    workspaceId: string,
  ): Promise<AssignedBatch[]> {
    const teacher = await this.teachers.findByUserInWorkspace(
      userId,
      workspaceId,
    );
    if (!teacher?.isActive) throw new TeacherNotFoundError();
    return this.assignments.listActive(teacher.id, workspaceId);
  }

  async assign(command: {
    teacherId: string;
    batchId: string;
    workspaceId: string;
    userId: string;
  }): Promise<AssignedBatch[]> {
    await this.activeTeacher(command.teacherId, command.workspaceId);
    const status = await this.assignments.batchStatus(
      command.batchId,
      command.workspaceId,
    );
    if (status === "missing")
      throw new DomainError("BATCH_NOT_FOUND", "Batch not found.");
    if (status === "closed")
      throw new DomainError(
        "BATCH_CLOSED",
        "Closed Batches cannot receive Teachers.",
      );
    await this.assignments.assign(command);
    return this.assignments.listActive(command.teacherId, command.workspaceId);
  }

  async unassign(command: {
    teacherId: string;
    batchId: string;
    workspaceId: string;
    userId: string;
  }): Promise<AssignedBatch[]> {
    await this.activeTeacher(command.teacherId, command.workspaceId);
    const changed = await this.assignments.unassign(command);
    if (!changed)
      throw new DomainError(
        "TEACHER_ASSIGNMENT_NOT_FOUND",
        "Teacher is not assigned to this Batch.",
      );
    return this.assignments.listActive(command.teacherId, command.workspaceId);
  }

  private async activeTeacher(
    teacherId: string,
    workspaceId: string,
  ): Promise<void> {
    const teacher = await this.teachers.findByIdInWorkspace(
      teacherId,
      workspaceId,
    );
    if (teacher == null) throw new TeacherNotFoundError();
    if (!teacher.isActive)
      throw new DomainError("TEACHER_INACTIVE", "Teacher is inactive.");
  }
}
