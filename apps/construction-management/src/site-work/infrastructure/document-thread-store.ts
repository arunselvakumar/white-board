import type { Prisma, PrismaClient } from "@repo/construction-db";

import { recordAudit } from "@/src/shared-kernel/audit";
import { DomainError, conflict } from "@/src/shared-kernel/domain-error";
import {
  markStoredFileDeleted,
  recordStoredFile,
} from "@/src/shared-kernel/files/stored-files";
import { isUniqueViolation } from "@/src/shared-kernel/prisma-errors";

import type {
  SiteWorkDocumentThreadStore,
  StoredSiteWorkDocumentFile,
} from "../application/document-thread-ports";
import type {
  SiteWorkDocumentFile,
  SiteWorkRemark,
} from "../domain/document-thread";
import type { SiteWorkDocumentType } from "../domain/site-work-documents";
import { lockSiteWorkDocument } from "./document-locator";

type FileRow = Prisma.ConstructionSiteWorkDocumentFileGetPayload<object>;
type RemarkRow = Prisma.ConstructionSiteWorkRemarkGetPayload<object>;

function toFile(row: FileRow): StoredSiteWorkDocumentFile {
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

function liveFile(row: FileRow): SiteWorkDocumentFile {
  const { deletedAt: _deletedAt, ...file } = toFile(row);
  return file;
}

function toRemark(row: RemarkRow): SiteWorkRemark {
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
  documentType: SiteWorkDocumentType,
  documentId: string,
) => ({ workspaceId, documentType, documentId });

const OLDEST_FIRST = [{ createdAt: "asc" as const }, { id: "asc" as const }];

/**
 * `construction_site_work.remarks` and `document_files`. Each write is
 * one transaction holding the document's row (`lockSiteWorkDocument`), with its
 * `stored_files` rows and audit event.
 */
export class PrismaSiteWorkDocumentThreadStore implements SiteWorkDocumentThreadStore {
  constructor(private readonly db: PrismaClient) {}

  async remarks(
    workspaceId: string,
    type: SiteWorkDocumentType,
    documentId: string,
  ) {
    const rows = await this.db.constructionSiteWorkRemark.findMany({
      where: ofDocument(workspaceId, type, documentId),
      orderBy: OLDEST_FIRST,
    });
    return rows.map(toRemark);
  }

  async files(
    workspaceId: string,
    type: SiteWorkDocumentType,
    documentId: string,
  ) {
    const rows = await this.db.constructionSiteWorkDocumentFile.findMany({
      where: { ...ofDocument(workspaceId, type, documentId), deletedAt: null },
      orderBy: OLDEST_FIRST,
    });
    return rows.map(liveFile);
  }

  countFiles(
    workspaceId: string,
    type: SiteWorkDocumentType,
    documentId: string,
  ) {
    return this.db.constructionSiteWorkDocumentFile.count({
      where: { ...ofDocument(workspaceId, type, documentId), deletedAt: null },
    });
  }

  async file(
    workspaceId: string,
    type: SiteWorkDocumentType,
    documentId: string,
    fileId: string,
  ) {
    const row = await this.db.constructionSiteWorkDocumentFile.findFirst({
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
    type: SiteWorkDocumentType,
    documentId: string,
    key: string,
  ) {
    const row = await this.db.constructionSiteWorkDocumentFile.findFirst({
      where: { fileKey: key, ...ofDocument(workspaceId, type, documentId) },
    });
    return row == null ? null : toFile(row);
  }

  async addRemark(
    input: Parameters<SiteWorkDocumentThreadStore["addRemark"]>[0],
  ): Promise<SiteWorkDocumentFile[]> {
    const { document, remark, fileIds } = input;
    return this.db.$transaction(async (tx) => {
      await lockSiteWorkDocument(tx, document);
      const files =
        fileIds.length === 0
          ? []
          : await tx.constructionSiteWorkDocumentFile.findMany({
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
      await tx.constructionSiteWorkRemark.create({
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
        await tx.constructionSiteWorkDocumentFile.updateMany({
          where: { id: { in: files.map((file) => file.id) }, remarkId: null },
          data: { remarkId: remark.id },
        });
      await recordAudit(tx, input.audit);
      return files.map((row) => ({ ...liveFile(row), remarkId: remark.id }));
    });
  }

  async addFile(
    input: Parameters<SiteWorkDocumentThreadStore["addFile"]>[0],
  ): Promise<"added" | "duplicate"> {
    const { document, file } = input;
    try {
      await this.db.$transaction(async (tx) => {
        await lockSiteWorkDocument(tx, document);
        const live = await tx.constructionSiteWorkDocumentFile.count({
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
        await tx.constructionSiteWorkDocumentFile.create({
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
    input: Parameters<SiteWorkDocumentThreadStore["removeFile"]>[0],
  ): Promise<boolean> {
    const { file } = input;
    return this.db.$transaction(async (tx) => {
      const written = await tx.constructionSiteWorkDocumentFile.updateMany({
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
