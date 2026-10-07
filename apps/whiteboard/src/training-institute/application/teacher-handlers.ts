import { DomainError } from "../domain/errors";
import { Teacher } from "../domain/teacher";
import type { TeacherRepository } from "../domain/teacher-repository";
import type { RawTeacherDetails } from "../domain/teacher-details";
import {
  decodeTeacherPhoto,
  type EncodedTeacherBinary,
} from "./teacher-binary";
import { decodeTeacherDocument } from "./teacher-binary";
import type {
  TeacherDocumentContent,
  TeacherDocumentKind,
  TeacherDocumentMetadata,
  TeacherDocumentRepository,
} from "../domain/teacher-document-repository";
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
  /** Ends the Teacher's sign-in access: their membership and any invitation. */
  removeAccess(input: {
    workspaceId: string;
    teacherUserId: string | null;
    invitationId: string | null;
  }): Promise<void>;
};

export class TeacherHandlers {
  constructor(
    private readonly teachers: TeacherRepository,
    private readonly invitations: TeacherInviter,
    private readonly documents: TeacherDocumentRepository,
  ) {}

  async create(command: {
    workspaceId: string;
    userId: string;
    name: string;
    email: string;
    kind: string;
    phone?: string | null;
    qualificationSummary?: string | null;
    details?: RawTeacherDetails;
    privateDetails?: {
      idNumber?: string | null;
      bankAccountNumber?: string | null;
    };
    photo?: EncodedTeacherBinary;
  }): Promise<Teacher> {
    const now = new Date();
    const photo =
      command.photo == null ? null : await decodeTeacherPhoto(command.photo);
    const teacher = Teacher.create({
      id: crypto.randomUUID(),
      workspaceId: command.workspaceId,
      createdByUserId: command.userId,
      name: command.name,
      email: command.email,
      kind: command.kind,
      phone: command.phone,
      qualificationSummary: command.qualificationSummary,
      details: command.details,
      now,
    });
    if (photo != null) teacher.attachPhoto(photo.mimeType, now);
    if (command.privateDetails != null)
      teacher.recordPrivateNumberMasks(command.privateDetails, now);
    await this.teachers.create(teacher, {
      photoData: photo?.bytes,
      idNumber: command.privateDetails?.idNumber,
      bankAccountNumber: command.privateDetails?.bankAccountNumber,
    });
    await this.sendInvitation(teacher, command.userId);
    return teacher;
  }

  async get(id: string, workspaceId: string): Promise<Teacher> {
    const teacher = await this.teachers.findByIdInWorkspace(id, workspaceId);
    if (teacher == null) throw new TeacherNotFoundError();
    return teacher;
  }

  async getPhoto(
    id: string,
    workspaceId: string,
  ): Promise<{ mimeType: string; bytes: Uint8Array }> {
    const photo = await this.teachers.findPhotoByIdInWorkspace(id, workspaceId);
    if (photo == null) throw new TeacherNotFoundError();
    return photo;
  }

  async listDocuments(
    id: string,
    workspaceId: string,
  ): Promise<TeacherDocumentMetadata[]> {
    await this.get(id, workspaceId);
    return this.documents.list(id, workspaceId);
  }

  async addDocument(command: {
    teacherId: string;
    workspaceId: string;
    userId: string;
    kind: TeacherDocumentKind;
    name: string;
    mimeType: string;
    dataBase64: string;
  }): Promise<TeacherDocumentMetadata> {
    const teacher = await this.get(command.teacherId, command.workspaceId);
    if (!teacher.isActive)
      throw new DomainError("TEACHER_INACTIVE", "Teacher is inactive.");
    const name = command.name.trim();
    if (
      name.length === 0 ||
      name.length > 200 ||
      Array.from(name).some(
        (character) =>
          character === "/" ||
          character === "\\" ||
          character.charCodeAt(0) < 32,
      )
    ) {
      throw new DomainError(
        "TEACHER_DOCUMENT_NAME_INVALID",
        "Document name is invalid.",
      );
    }
    const current = await this.documents.list(
      command.teacherId,
      command.workspaceId,
    );
    if (current.length >= 10)
      throw new DomainError(
        "TEACHER_DOCUMENT_LIMIT",
        "A Teacher may have at most ten active documents.",
      );
    const file = await decodeTeacherDocument(command);
    const document: TeacherDocumentMetadata = {
      id: crypto.randomUUID(),
      teacherId: teacher.id,
      kind: command.kind,
      name,
      mimeType: file.mimeType,
      sizeBytes: file.bytes.length,
      uploadedAt: new Date(),
    };
    await this.documents.create({
      ...document,
      workspaceId: command.workspaceId,
      uploadedByUserId: command.userId,
      bytes: file.bytes,
    });
    return document;
  }

  async getDocument(
    id: string,
    teacherId: string,
    workspaceId: string,
  ): Promise<TeacherDocumentContent> {
    await this.get(teacherId, workspaceId);
    const document = await this.documents.find(id, teacherId, workspaceId);
    if (document == null)
      throw new DomainError(
        "TEACHER_DOCUMENT_NOT_FOUND",
        "Teacher document was not found.",
      );
    return document;
  }

  async removeDocument(
    id: string,
    teacherId: string,
    workspaceId: string,
    userId: string,
  ): Promise<void> {
    await this.get(teacherId, workspaceId);
    const removed = await this.documents.remove(
      id,
      teacherId,
      workspaceId,
      userId,
      new Date(),
    );
    if (!removed)
      throw new DomainError(
        "TEACHER_DOCUMENT_NOT_FOUND",
        "Teacher document was not found.",
      );
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
    const after =
      query.after == null
        ? undefined
        : decodeListCursor(query.after, (id) => ({ value: id }));
    const before =
      query.before == null
        ? undefined
        : decodeListCursor(query.before, (id) => ({ value: id }));
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
      nextCursor:
        last != null && (query.before != null || page.hasMore)
          ? encodeListCursor({
              createdAt: last.createdAt,
              id: { value: last.id },
            })
          : null,
      prevCursor:
        first != null &&
        (query.after != null || (query.before != null && page.hasMore))
          ? encodeListCursor({
              createdAt: first.createdAt,
              id: { value: first.id },
            })
          : null,
    };
  }

  async updateProfile(command: {
    id: string;
    workspaceId: string;
    name: string;
    kind: string;
    phone?: string | null;
    qualificationSummary?: string | null;
    details?: RawTeacherDetails;
    privateDetails?: {
      idNumber?: string | null;
      bankAccountNumber?: string | null;
    };
    photo?: EncodedTeacherBinary;
  }): Promise<Teacher> {
    const teacher = await this.get(command.id, command.workspaceId);
    const now = new Date();
    const photo =
      command.photo == null ? null : await decodeTeacherPhoto(command.photo);
    teacher.updateProfile({ ...command, now });
    if (photo != null) teacher.attachPhoto(photo.mimeType, now);
    if (command.privateDetails != null)
      teacher.recordPrivateNumberMasks(command.privateDetails, now);
    await this.teachers.save(teacher, {
      photoData: photo?.bytes,
      idNumber: command.privateDetails?.idNumber,
      bankAccountNumber: command.privateDetails?.bankAccountNumber,
    });
    return teacher;
  }

  async invite(command: {
    id: string;
    workspaceId: string;
    userId: string;
  }): Promise<Teacher> {
    const teacher = await this.get(command.id, command.workspaceId);
    if (!teacher.isActive)
      throw new DomainError("TEACHER_INACTIVE", "Teacher is inactive.");
    if (teacher.userId != null)
      throw new DomainError(
        "TEACHER_ALREADY_ACTIVE",
        "Teacher has already joined.",
      );
    await this.sendInvitation(teacher, command.userId);
    return teacher;
  }

  /**
   * Links the signed-in User to the Teacher whose invitation they accepted
   * (ADR-0034). Returns null when none of their accepted invitations belongs
   * to an active Teacher in the Workspace.
   */
  async activate(command: {
    workspaceId: string;
    userId: string;
    acceptedInvitationIds: readonly string[];
  }): Promise<Teacher | null> {
    const teacher =
      (await this.teachers.findByUserInWorkspace(
        command.userId,
        command.workspaceId,
      )) ??
      (await this.teachers.findByInvitationInWorkspace(
        command.acceptedInvitationIds,
        command.workspaceId,
      ));
    if (teacher == null) return null;
    teacher.activate(command.userId, new Date());
    await this.teachers.save(teacher);
    return teacher;
  }

  async deactivate(command: {
    id: string;
    workspaceId: string;
    userId: string;
  }): Promise<Teacher> {
    const teacher = await this.get(command.id, command.workspaceId);
    if (!teacher.isActive)
      throw new DomainError("TEACHER_INACTIVE", "Teacher is inactive.");
    await this.invitations.removeAccess({
      workspaceId: command.workspaceId,
      teacherUserId: teacher.userId,
      invitationId: teacher.invitationId,
    });
    teacher.deactivate(command.userId, new Date());
    await this.teachers.save(teacher);
    return teacher;
  }

  private async sendInvitation(
    teacher: Teacher,
    inviterUserId: string,
  ): Promise<void> {
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
      console.error(
        "Teacher invitation failed",
        { teacherId: teacher.id },
        error,
      );
      teacher.markInvitationFailed(new Date());
    }
    await this.teachers.save(teacher);
  }
}
