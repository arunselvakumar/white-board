import { Prisma, type PrismaClient } from "@repo/construction-db";

import { recordAudit } from "@/src/shared-kernel/audit";
import { DomainError, conflict } from "@/src/shared-kernel/domain-error";
import {
  markStoredFileDeleted,
  recordStoredFile,
} from "@/src/shared-kernel/files/stored-files";

import type {
  AuthorNames,
  DocumentThreadStore,
  StoredDocumentFile,
} from "../application/document-thread-ports";
import type { DocumentFile, DocumentRemark } from "../domain/document-thread";
import type { ProcurementDocumentType } from "../domain/documents";
import { lockDocument } from "./document-locator";

type FileRow = Prisma.ConstructionProcurementDocumentFileGetPayload<object>;
type RemarkRow = Prisma.ConstructionProcurementRemarkGetPayload<object>;

function toFile(row: FileRow): StoredDocumentFile {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    documentType: row.documentType,
    documentId: row.documentId,
    remarkId: row.remarkId,
    fileKey: row.fileKey,
    fileName: row.fileName,
    contentType: row.contentType,
    bytes: row.bytes,
    thumbKey: row.thumbKey,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
    deletedAt: row.deletedAt,
  };
}

function liveFile(row: FileRow): DocumentFile {
  const { deletedAt: _deletedAt, ...file } = toFile(row);
  return file;
}

function toRemark(row: RemarkRow): DocumentRemark {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    documentType: row.documentType,
    documentId: row.documentId,
    body: row.body,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

const ofDocument = (
  workspaceId: string,
  documentType: ProcurementDocumentType,
  documentId: string,
) => ({ workspaceId, documentType, documentId });

const OLDEST_FIRST = [{ createdAt: "asc" as const }, { id: "asc" as const }];

/**
 * `construction_procurement.remarks` and `document_files`. Each write is
 * one transaction holding the document's row (`lockDocument`), with its
 * `stored_files` rows and audit event.
 */
export class PrismaDocumentThreadStore implements DocumentThreadStore {
  constructor(private readonly db: PrismaClient) {}

  async remarks(
    workspaceId: string,
    type: ProcurementDocumentType,
    documentId: string,
  ) {
    const rows = await this.db.constructionProcurementRemark.findMany({
      where: ofDocument(workspaceId, type, documentId),
      orderBy: OLDEST_FIRST,
    });
    return rows.map(toRemark);
  }

  async files(
    workspaceId: string,
    type: ProcurementDocumentType,
    documentId: string,
  ) {
    const rows = await this.db.constructionProcurementDocumentFile.findMany({
      where: { ...ofDocument(workspaceId, type, documentId), deletedAt: null },
      orderBy: OLDEST_FIRST,
    });
    return rows.map(liveFile);
  }

  countFiles(
    workspaceId: string,
    type: ProcurementDocumentType,
    documentId: string,
  ) {
    return this.db.constructionProcurementDocumentFile.count({
      where: { ...ofDocument(workspaceId, type, documentId), deletedAt: null },
    });
  }

  async file(
    workspaceId: string,
    type: ProcurementDocumentType,
    documentId: string,
    fileId: string,
  ) {
    const row = await this.db.constructionProcurementDocumentFile.findFirst({
      where: {
        id: fileId,
        ...ofDocument(workspaceId, type, documentId),
        deletedAt: null,
      },
    });
    return row == null ? null : liveFile(row);
  }

  async fileByKey(
    workspaceId: string,
    type: ProcurementDocumentType,
    documentId: string,
    key: string,
  ) {
    const row = await this.db.constructionProcurementDocumentFile.findFirst({
      where: { fileKey: key, ...ofDocument(workspaceId, type, documentId) },
    });
    return row == null ? null : toFile(row);
  }

  async addRemark(
    input: Parameters<DocumentThreadStore["addRemark"]>[0],
  ): Promise<DocumentFile[]> {
    const { document, remark, fileIds } = input;
    return this.db.$transaction(async (tx) => {
      await lockDocument(tx, document);
      const files =
        fileIds.length === 0
          ? []
          : await tx.constructionProcurementDocumentFile.findMany({
              where: {
                id: { in: [...fileIds] },
                ...ofDocument(document.workspaceId, document.type, document.id),
                remarkId: null,
                createdBy: remark.createdBy,
                deletedAt: null,
              },
              orderBy: OLDEST_FIRST,
            });
      if (files.length !== fileIds.length) {
        const found = new Set(files.map((file) => file.id));
        throw new DomainError(
          "DOCUMENT_FILE_NOT_FOUND",
          "Upload the files again, then post.",
          {
            details: { fileIds: fileIds.filter((id) => !found.has(id)) },
          },
        );
      }
      await tx.constructionProcurementRemark.create({
        data: {
          id: remark.id,
          workspaceId: remark.workspaceId,
          documentType: remark.documentType,
          documentId: remark.documentId,
          body: remark.body,
          createdAt: remark.createdAt,
          createdBy: remark.createdBy,
        },
      });
      if (files.length > 0)
        await tx.constructionProcurementDocumentFile.updateMany({
          where: { id: { in: files.map((file) => file.id) }, remarkId: null },
          data: { remarkId: remark.id },
        });
      await recordAudit(tx, input.audit);
      return files.map((row) => ({ ...liveFile(row), remarkId: remark.id }));
    });
  }

  async addFile(
    input: Parameters<DocumentThreadStore["addFile"]>[0],
  ): Promise<"added" | "duplicate"> {
    const { document, file } = input;
    try {
      await this.db.$transaction(async (tx) => {
        await lockDocument(tx, document);
        const live = await tx.constructionProcurementDocumentFile.count({
          where: {
            ...ofDocument(document.workspaceId, document.type, document.id),
            deletedAt: null,
          },
        });
        if (live >= input.maxFiles)
          throw conflict(
            "DOCUMENT_FILES_LIMIT",
            `Keep at most ${String(input.maxFiles)} files on a document. Remove one first.`,
          );
        await tx.constructionProcurementDocumentFile.create({
          data: {
            id: file.id,
            workspaceId: file.workspaceId,
            documentType: file.documentType,
            documentId: file.documentId,
            remarkId: null,
            fileKey: file.fileKey,
            fileName: file.fileName,
            contentType: file.contentType,
            bytes: file.bytes,
            thumbKey: file.thumbKey,
            createdAt: file.createdAt,
            createdBy: file.createdBy,
          },
        });
        for (const stored of input.storedFiles)
          await recordStoredFile(tx, stored);
        await recordAudit(tx, input.audit);
      });
      return "added";
    } catch (error) {
      if (isUniqueViolation(error)) return "duplicate";
      throw error;
    }
  }

  async removeFile(
    input: Parameters<DocumentThreadStore["removeFile"]>[0],
  ): Promise<boolean> {
    const { file } = input;
    return this.db.$transaction(async (tx) => {
      const written = await tx.constructionProcurementDocumentFile.updateMany({
        where: {
          id: file.id,
          ...ofDocument(file.workspaceId, file.documentType, file.documentId),
          deletedAt: null,
        },
        data: { deletedAt: input.now, deletedBy: input.by },
      });
      if (written.count === 0) return false;
      await markStoredFileDeleted(
        tx,
        file.workspaceId,
        file.fileKey,
        input.now,
      );
      if (file.thumbKey != null)
        await markStoredFileDeleted(
          tx,
          file.workspaceId,
          file.thumbKey,
          input.now,
        );
      await recordAudit(tx, input.audit);
      return true;
    });
  }
}

/**
 * Names by User id from `construction_organization.team_members`, the
 * Owner's row included (read by id, like the projects context's uploader
 * names; `ProcurementDirectory.teamMembers` answers Team Member ids and
 * live rows only). A removed Team Member's name still shows; a live row
 * wins.
 */
export class PrismaDocumentAuthorNames implements AuthorNames {
  constructor(private readonly db: PrismaClient) {}

  async namesOf(
    workspaceId: string,
    userIds: readonly string[],
  ): Promise<Map<string, string>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.db.$queryRaw<{ userId: string; name: string }[]>(
      Prisma.sql`
        SELECT DISTINCT ON (user_id) user_id AS "userId", name
        FROM construction_organization.team_members
        WHERE workspace_id = ${workspaceId}
          AND user_id = ANY(${[...userIds]}::text[])
        ORDER BY user_id, (deleted_at IS NULL) DESC, created_at DESC
      `,
    );
    return new Map(rows.map((row) => [row.userId, row.name]));
  }
}
