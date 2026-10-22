import type { Prisma, PrismaClient } from "@repo/construction-db";

import { recordAudit } from "@/src/shared-kernel/audit";
import { conflict } from "@/src/shared-kernel/domain-error";
import {
  markStoredFileDeleted,
  recordStoredFile,
} from "@/src/shared-kernel/files/stored-files";
import { isUniqueViolation } from "@/src/shared-kernel/prisma-errors";

import type {
  StoredTrackingDocumentFile,
  TrackingDocumentFileStore,
} from "../application/document-files-ports";
import type { TrackingDocumentFile } from "../domain/document-files";
import type { TrackingDocumentType } from "../domain/tracking-documents";
import { lockTrackingDocument } from "./document-locator";

type FileRow = Prisma.ConstructionTrackingDocumentFileGetPayload<object>;

export function toStoredTrackingFile(row: FileRow): StoredTrackingDocumentFile {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    documentType: row.documentType,
    documentId: row.documentId,
    entryId: row.entryId,
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

export function liveTrackingFile(row: FileRow): TrackingDocumentFile {
  const { deletedAt: _deletedAt, ...file } = toStoredTrackingFile(row);
  return file;
}

export const ofTrackingDocument = (
  workspaceId: string,
  documentType: TrackingDocumentType,
  documentId: string,
) => ({ workspaceId, documentType, documentId });

export const OLDEST_FIRST = [
  { createdAt: "asc" as const },
  { id: "asc" as const },
];

/**
 * `construction_tracking.document_files`. Each write is one transaction
 * holding the document's row (`lockTrackingDocument`), with its
 * `stored_files` rows and audit event.
 */
export class PrismaTrackingDocumentFileStore implements TrackingDocumentFileStore {
  constructor(private readonly db: PrismaClient) {}

  async files(
    workspaceId: string,
    type: TrackingDocumentType,
    documentId: string,
  ) {
    const rows = await this.db.constructionTrackingDocumentFile.findMany({
      where: {
        ...ofTrackingDocument(workspaceId, type, documentId),
        deletedAt: null,
      },
      orderBy: OLDEST_FIRST,
    });
    return rows.map(liveTrackingFile);
  }

  countFiles(
    workspaceId: string,
    type: TrackingDocumentType,
    documentId: string,
  ) {
    return this.db.constructionTrackingDocumentFile.count({
      where: {
        ...ofTrackingDocument(workspaceId, type, documentId),
        deletedAt: null,
      },
    });
  }

  async file(
    workspaceId: string,
    type: TrackingDocumentType,
    documentId: string,
    fileId: string,
  ) {
    const row = await this.db.constructionTrackingDocumentFile.findFirst({
      where: {
        id: fileId,
        ...ofTrackingDocument(workspaceId, type, documentId),
        deletedAt: null,
      },
    });
    return row == null ? null : liveTrackingFile(row);
  }

  async fileByKey(
    workspaceId: string,
    type: TrackingDocumentType,
    documentId: string,
    key: string,
  ) {
    const row = await this.db.constructionTrackingDocumentFile.findFirst({
      where: {
        fileKey: key,
        ...ofTrackingDocument(workspaceId, type, documentId),
      },
    });
    return row == null ? null : toStoredTrackingFile(row);
  }

  async addFile(
    input: Parameters<TrackingDocumentFileStore["addFile"]>[0],
  ): Promise<"added" | "duplicate"> {
    const { document, file } = input;
    try {
      await this.db.$transaction(async (tx) => {
        await lockTrackingDocument(tx, document);
        const live = await tx.constructionTrackingDocumentFile.count({
          where: {
            ...ofTrackingDocument(
              document.workspaceId,
              document.type,
              document.id,
            ),
            deletedAt: null,
          },
        });
        if (live >= input.maxFiles)
          throw conflict(
            "DOCUMENT_FILES_LIMIT",
            `Keep at most ${String(input.maxFiles)} files on a document. Remove one first.`,
          );
        await tx.constructionTrackingDocumentFile.create({
          data: {
            id: file.id,
            workspaceId: file.workspaceId,
            projectId: file.projectId,
            documentType: file.documentType,
            documentId: file.documentId,
            entryId: null,
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
    input: Parameters<TrackingDocumentFileStore["removeFile"]>[0],
  ): Promise<boolean> {
    const { file } = input;
    return this.db.$transaction(async (tx) => {
      const written = await tx.constructionTrackingDocumentFile.updateMany({
        where: {
          id: file.id,
          ...ofTrackingDocument(
            file.workspaceId,
            file.documentType,
            file.documentId,
          ),
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
