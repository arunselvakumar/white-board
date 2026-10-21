import { Prisma, type PrismaClient } from "@repo/construction-db";

import { recordAudit } from "@/src/shared-kernel/audit";
import {
  markStoredFileDeleted,
  recordStoredFile,
} from "@/src/shared-kernel/files/stored-files";

import type {
  SalesDocumentFileStore,
  StoredSalesDocumentFile,
} from "../application/document-files";
import {
  SALES_FILE_ROLE_RULES,
  salesFilesLimit,
  type SalesDocumentFile,
  type SalesDocumentType,
} from "../domain/document-files";
import { lockSalesDocument } from "./document-locator";

type FileRow = Prisma.ConstructionSalesDocumentFileGetPayload<object>;

function toStored(row: FileRow): StoredSalesDocumentFile {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    documentType: row.documentType,
    documentId: row.documentId,
    role: row.role,
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

function live(row: FileRow): SalesDocumentFile {
  const { deletedAt: _deletedAt, ...file } = toStored(row);
  return file;
}

const of = (
  workspaceId: string,
  documentType: SalesDocumentType,
  documentId: string,
) => ({ workspaceId, documentType, documentId });

const OLDEST_FIRST = [{ createdAt: "asc" as const }, { id: "asc" as const }];

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

/**
 * `construction_sales.document_files` (CM-1003). Each write is one
 * transaction holding the document's row, with its `stored_files` rows
 * and audit event.
 */
export class PrismaSalesDocumentFileStore implements SalesDocumentFileStore {
  constructor(private readonly db: PrismaClient) {}

  async files(
    workspaceId: string,
    type: SalesDocumentType,
    documentId: string,
  ) {
    const rows = await this.db.constructionSalesDocumentFile.findMany({
      where: { ...of(workspaceId, type, documentId), deletedAt: null },
      orderBy: OLDEST_FIRST,
    });
    return rows.map(live);
  }

  countFiles(
    workspaceId: string,
    type: SalesDocumentType,
    documentId: string,
    role: SalesDocumentFile["role"],
  ) {
    return this.db.constructionSalesDocumentFile.count({
      where: { ...of(workspaceId, type, documentId), role, deletedAt: null },
    });
  }

  async file(
    workspaceId: string,
    type: SalesDocumentType,
    documentId: string,
    fileId: string,
  ) {
    const row = await this.db.constructionSalesDocumentFile.findFirst({
      where: {
        id: fileId,
        ...of(workspaceId, type, documentId),
        deletedAt: null,
      },
    });
    return row == null ? null : live(row);
  }

  async fileByKey(
    workspaceId: string,
    type: SalesDocumentType,
    documentId: string,
    key: string,
  ) {
    const row = await this.db.constructionSalesDocumentFile.findFirst({
      where: { fileKey: key, ...of(workspaceId, type, documentId) },
    });
    return row == null ? null : toStored(row);
  }

  async addFile(
    input: Parameters<SalesDocumentFileStore["addFile"]>[0],
  ): Promise<"added" | "duplicate"> {
    const { document, file } = input;
    try {
      await this.db.$transaction(async (tx) => {
        await lockSalesDocument(tx, document);
        const live = await tx.constructionSalesDocumentFile.count({
          where: {
            ...of(document.workspaceId, document.type, document.id),
            role: file.role,
            deletedAt: null,
          },
        });
        if (live >= SALES_FILE_ROLE_RULES[file.role].max)
          throw salesFilesLimit(file.role);
        await tx.constructionSalesDocumentFile.create({
          data: {
            id: file.id,
            workspaceId: file.workspaceId,
            projectId: file.projectId,
            documentType: file.documentType,
            documentId: file.documentId,
            role: file.role,
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
    input: Parameters<SalesDocumentFileStore["removeFile"]>[0],
  ): Promise<boolean> {
    const { file } = input;
    return this.db.$transaction(async (tx) => {
      const written = await tx.constructionSalesDocumentFile.updateMany({
        where: {
          id: file.id,
          ...of(file.workspaceId, file.documentType, file.documentId),
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
