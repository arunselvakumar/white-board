import type { Prisma, PrismaClient } from "@repo/construction-db";

import { recordAudit } from "@/src/shared-kernel/audit";
import { DomainError, conflict } from "@/src/shared-kernel/domain-error";
import {
  markStoredFileDeleted,
  recordStoredFile,
} from "@/src/shared-kernel/files/stored-files";
import { isUniqueViolation } from "@/src/shared-kernel/prisma-errors";

import type {
  FinanceDocumentThreadStore,
  StoredFinanceDocumentFile,
} from "../application/document-thread-ports";
import type {
  FinanceDocumentFile,
  FinanceDocumentType,
  FinanceRemark,
} from "../domain/finance-documents";
import { lockFinanceDocument } from "./document-locator";

type FileRow = Prisma.ConstructionFinanceDocumentFileGetPayload<object>;
type RemarkRow = Prisma.ConstructionFinanceRemarkGetPayload<object>;

function toFile(row: FileRow): StoredFinanceDocumentFile {
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

function liveFile(row: FileRow): FinanceDocumentFile {
  const { deletedAt: _deletedAt, ...file } = toFile(row);
  return file;
}

function toRemark(row: RemarkRow): FinanceRemark {
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

const ofDocument = (
  workspaceId: string,
  documentType: FinanceDocumentType,
  documentId: string,
) => ({ workspaceId, documentType, documentId });

const OLDEST_FIRST = [{ createdAt: "asc" as const }, { id: "asc" as const }];

/**
 * `construction_finance.remarks` and `document_files`. Each write is
 * one transaction holding the document's row (`lockFinanceDocument`), with its
 * `stored_files` rows and audit event.
 */
export class PrismaFinanceDocumentThreadStore implements FinanceDocumentThreadStore {
  constructor(private readonly db: PrismaClient) {}

  async remarks(
    workspaceId: string,
    type: FinanceDocumentType,
    documentId: string,
  ) {
    const rows = await this.db.constructionFinanceRemark.findMany({
      where: ofDocument(workspaceId, type, documentId),
      orderBy: OLDEST_FIRST,
    });
    return rows.map(toRemark);
  }

  async files(
    workspaceId: string,
    type: FinanceDocumentType,
    documentId: string,
  ) {
    const rows = await this.db.constructionFinanceDocumentFile.findMany({
      where: { ...ofDocument(workspaceId, type, documentId), deletedAt: null },
      orderBy: OLDEST_FIRST,
    });
    return rows.map(liveFile);
  }

  countFiles(
    workspaceId: string,
    type: FinanceDocumentType,
    documentId: string,
  ) {
    return this.db.constructionFinanceDocumentFile.count({
      where: { ...ofDocument(workspaceId, type, documentId), deletedAt: null },
    });
  }

  async file(
    workspaceId: string,
    type: FinanceDocumentType,
    documentId: string,
    fileId: string,
  ) {
    const row = await this.db.constructionFinanceDocumentFile.findFirst({
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
    type: FinanceDocumentType,
    documentId: string,
    key: string,
  ) {
    const row = await this.db.constructionFinanceDocumentFile.findFirst({
      where: { fileKey: key, ...ofDocument(workspaceId, type, documentId) },
    });
    return row == null ? null : toFile(row);
  }

  async addRemark(
    input: Parameters<FinanceDocumentThreadStore["addRemark"]>[0],
  ): Promise<FinanceDocumentFile[]> {
    const { document, remark, fileIds } = input;
    return this.db.$transaction(async (tx) => {
      await lockFinanceDocument(tx, document);
      const files =
        fileIds.length === 0
          ? []
          : await tx.constructionFinanceDocumentFile.findMany({
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
      await tx.constructionFinanceRemark.create({
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
        await tx.constructionFinanceDocumentFile.updateMany({
          where: { id: { in: files.map((file) => file.id) }, remarkId: null },
          data: { remarkId: remark.id },
        });
      await recordAudit(tx, input.audit);
      return files.map((row) => ({ ...liveFile(row), remarkId: remark.id }));
    });
  }

  async addFile(
    input: Parameters<FinanceDocumentThreadStore["addFile"]>[0],
  ): Promise<"added" | "duplicate"> {
    const { document, file } = input;
    try {
      await this.db.$transaction(async (tx) => {
        await lockFinanceDocument(tx, document);
        const live = await tx.constructionFinanceDocumentFile.count({
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
        await tx.constructionFinanceDocumentFile.create({
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
    input: Parameters<FinanceDocumentThreadStore["removeFile"]>[0],
  ): Promise<boolean> {
    const { file } = input;
    return this.db.$transaction(async (tx) => {
      const written = await tx.constructionFinanceDocumentFile.updateMany({
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
