import { Prisma, type PrismaClient } from "@repo/whiteboard-db";

import type {
  TeacherDocumentContent,
  TeacherDocumentKind,
  TeacherDocumentMetadata,
  TeacherDocumentRepository,
} from "../domain/teacher-document-repository";
import { DomainError } from "../domain/errors";
import { TeacherNotFoundError } from "../application/not-found-error";
import {
  decryptPrivateBytes,
  encryptPrivateBytes,
} from "./teacher-private-data";

export class PrismaTeacherDocumentRepository implements TeacherDocumentRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(
    input: TeacherDocumentMetadata & {
      workspaceId: string;
      uploadedByUserId: string;
      bytes: Uint8Array;
    },
  ): Promise<void> {
    const encryptedData = encryptPrivateBytes(input.bytes);
    await this.db.$transaction(async (tx) => {
      const teachers = await tx.$queryRaw<
        { id: string; deactivatedAt: Date | null }[]
      >(Prisma.sql`
        SELECT "id", "deactivated_at" AS "deactivatedAt" FROM "training_institute"."teachers"
        WHERE "id" = ${input.teacherId}::uuid AND "workspace_id" = ${input.workspaceId} AND "deleted_at" IS NULL
        FOR UPDATE
      `);
      if (teachers.length === 0) throw new TeacherNotFoundError();
      if (teachers[0]?.deactivatedAt != null)
        throw new DomainError("TEACHER_INACTIVE", "Teacher is inactive.");
      const count = await tx.trainingInstituteTeacherDocument.count({
        where: {
          teacherId: input.teacherId,
          workspaceId: input.workspaceId,
          deletedAt: null,
        },
      });
      if (count >= 10)
        throw new DomainError(
          "TEACHER_DOCUMENT_LIMIT",
          "A Teacher may have at most ten active documents.",
        );
      await tx.trainingInstituteTeacherDocument.create({
        data: {
          id: input.id,
          workspaceId: input.workspaceId,
          teacherId: input.teacherId,
          kind: input.kind,
          name: input.name,
          mimeType: input.mimeType,
          encryptedData,
          sizeBytes: input.sizeBytes,
          uploadedAt: input.uploadedAt,
          uploadedByUserId: input.uploadedByUserId,
        },
      });
    });
  }

  async list(
    teacherId: string,
    workspaceId: string,
  ): Promise<TeacherDocumentMetadata[]> {
    const rows = await this.db.trainingInstituteTeacherDocument.findMany({
      where: { teacherId, workspaceId, deletedAt: null },
      orderBy: [{ uploadedAt: "desc" }, { id: "desc" }],
      omit: { encryptedData: true },
    });
    return rows.map((row) => ({
      id: row.id,
      teacherId: row.teacherId,
      kind: row.kind as TeacherDocumentKind,
      name: row.name,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      uploadedAt: row.uploadedAt,
    }));
  }

  async find(
    id: string,
    teacherId: string,
    workspaceId: string,
  ): Promise<TeacherDocumentContent | null> {
    const row = await this.db.trainingInstituteTeacherDocument.findFirst({
      where: { id, teacherId, workspaceId, deletedAt: null },
    });
    return row == null
      ? null
      : {
          id: row.id,
          teacherId: row.teacherId,
          kind: row.kind as TeacherDocumentKind,
          name: row.name,
          mimeType: row.mimeType,
          sizeBytes: row.sizeBytes,
          uploadedAt: row.uploadedAt,
          bytes: decryptPrivateBytes(row.encryptedData),
        };
  }

  async remove(
    id: string,
    teacherId: string,
    workspaceId: string,
    userId: string,
    now: Date,
  ): Promise<boolean> {
    const result = await this.db.trainingInstituteTeacherDocument.updateMany({
      where: { id, teacherId, workspaceId, deletedAt: null },
      data: { deletedAt: now, deletedByUserId: userId },
    });
    return result.count > 0;
  }
}
