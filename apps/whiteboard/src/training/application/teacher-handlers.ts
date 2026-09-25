import { DomainError } from "../domain/errors";
import { Teacher } from "../domain/teacher";
import type { TeacherRepository } from "../domain/teacher-repository";
import { decodeListCursor, encodeListCursor } from "./list-cursor";
import { TeacherNotFoundError } from "./not-found-error";

export type TeacherInviter = {
  send(input: {
    teacherId: string;
    workspaceId: string;
    inviterUserId: string;
    email: string;
    previousInvitationId: string | null;
  }): Promise<string>;
  removeAccess(input: { workspaceId: string; teacherId: string; clerkUserId: string | null; invitationId: string | null; userId: string }): Promise<void>;
};

export class TeacherHandlers {
  constructor(
    private readonly teachers: TeacherRepository,
    private readonly invitations: TeacherInviter,
  ) {}

  async create(command: {
    workspaceId: string;
    userId: string;
    name: string;
    email: string;
    kind: string;
    phone?: string | null;
    qualificationSummary?: string | null;
  }): Promise<Teacher> {
    const now = new Date();
    const teacher = Teacher.create({
      id: crypto.randomUUID(),
      workspaceId: command.workspaceId,
      createdByUserId: command.userId,
      name: command.name,
      email: command.email,
      kind: command.kind,
      phone: command.phone,
      qualificationSummary: command.qualificationSummary,
      now,
    });
    await this.teachers.create(teacher);
    await this.sendInvitation(teacher, command.userId);
    return teacher;
  }

  async get(id: string, workspaceId: string): Promise<Teacher> {
    const teacher = await this.teachers.findByIdInWorkspace(id, workspaceId);
    if (teacher == null) throw new TeacherNotFoundError();
    return teacher;
  }

  async list(query: {
    workspaceId: string;
    limit: number;
    after?: string;
    before?: string;
  }): Promise<{
    items: Teacher[];
    total: number;
    nextCursor: string | null;
    prevCursor: string | null;
  }> {
    const after = query.after == null ? undefined : decodeListCursor(query.after, (id) => ({ value: id }));
    const before = query.before == null ? undefined : decodeListCursor(query.before, (id) => ({ value: id }));
    const page = await this.teachers.listInWorkspace({
      workspaceId: query.workspaceId,
      limit: query.limit,
      after,
      before,
    });
    const first = page.items[0];
    const last = page.items[page.items.length - 1];
    return {
      items: page.items,
      total: page.total,
      nextCursor: last != null && (query.before != null || page.hasMore)
        ? encodeListCursor({ createdAt: last.createdAt, id: { value: last.id } }) : null,
      prevCursor: first != null && (query.after != null || (query.before != null && page.hasMore))
        ? encodeListCursor({ createdAt: first.createdAt, id: { value: first.id } }) : null,
    };
  }

  async updateProfile(command: {
    id: string;
    workspaceId: string;
    name: string;
    kind: string;
    phone?: string | null;
    qualificationSummary?: string | null;
  }): Promise<Teacher> {
    const teacher = await this.get(command.id, command.workspaceId);
    teacher.updateProfile({ ...command, now: new Date() });
    await this.teachers.save(teacher);
    return teacher;
  }

  async invite(command: { id: string; workspaceId: string; userId: string }): Promise<Teacher> {
    const teacher = await this.get(command.id, command.workspaceId);
    if (!teacher.isActive) throw new DomainError("TEACHER_INACTIVE", "Teacher is inactive.");
    if (teacher.clerkUserId != null) throw new DomainError("TEACHER_ALREADY_ACTIVE", "Teacher has already joined.");
    await this.sendInvitation(teacher, command.userId);
    return teacher;
  }

  async activate(command: {
    id: string;
    workspaceId: string;
    clerkUserId: string;
  }): Promise<Teacher> {
    const teacher = await this.get(command.id, command.workspaceId);
    teacher.activate(command.clerkUserId, new Date());
    await this.teachers.save(teacher);
    return teacher;
  }

  async deactivate(command: { id: string; workspaceId: string; userId: string }): Promise<Teacher> {
    const teacher = await this.get(command.id, command.workspaceId);
    if (!teacher.isActive) throw new DomainError("TEACHER_INACTIVE", "Teacher is inactive.");
    await this.invitations.removeAccess({
      workspaceId: command.workspaceId,
      teacherId: teacher.id,
      clerkUserId: teacher.clerkUserId,
      invitationId: teacher.invitationId,
      userId: command.userId,
    });
    teacher.deactivate(command.userId, new Date());
    await this.teachers.save(teacher);
    return teacher;
  }

  private async sendInvitation(teacher: Teacher, inviterUserId: string): Promise<void> {
    try {
      const invitationId = await this.invitations.send({
        teacherId: teacher.id,
        workspaceId: teacher.workspaceId,
        inviterUserId,
        email: teacher.email,
        previousInvitationId: teacher.invitationId,
      });
      teacher.markInvited(invitationId, new Date());
    } catch (error) {
      console.error("Teacher invitation failed", { teacherId: teacher.id }, error);
      teacher.markInvitationFailed(new Date());
    }
    await this.teachers.save(teacher);
  }
}
