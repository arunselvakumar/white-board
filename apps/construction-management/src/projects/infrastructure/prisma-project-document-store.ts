import { Prisma, type PrismaClient } from "@repo/construction-db";

import { recordAudit } from "@/src/shared-kernel/audit";
import { conflict, notFound } from "@/src/shared-kernel/domain-error";
import {
  markStoredFileDeleted,
  recordStoredFile,
} from "@/src/shared-kernel/files/stored-files";

import type {
  ProjectDocumentStore,
  StoredProjectDocument,
} from "../application/project-documents";

type Row = Prisma.ConstructionProjectsDocumentGetPayload<object>;

function toDocument(row: Row): StoredProjectDocument {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    kind: row.kind,
    fileKey: row.fileKey,
    fileName: row.fileName,
    contentType: row.contentType,
    bytes: row.bytes,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
    deletedAt: row.deletedAt,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

/**
 * `construction_projects.documents`, each write in one transaction with its
 * `stored_files` row and audit event. Adding locks the Project row, so two
 * uploads finishing together cannot pass the per-Project limit, and a
 * Project deleted meanwhile gets no new files.
 */
export class PrismaProjectDocumentStore implements ProjectDocumentStore {
  constructor(private readonly db: PrismaClient) {}

  async list(workspaceId: string, projectId: string) {
    const rows = await this.db.constructionProjectsDocument.findMany({
      where: { workspaceId, projectId, deletedAt: null },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return rows.map(toDocument);
  }

  async count(workspaceId: string, projectId: string): Promise<number> {
    return this.db.constructionProjectsDocument.count({
      where: { workspaceId, projectId, deletedAt: null },
    });
  }

  async find(workspaceId: string, projectId: string, id: string) {
    const row = await this.db.constructionProjectsDocument.findFirst({
      where: { id, workspaceId, projectId, deletedAt: null },
    });
    return row == null ? null : toDocument(row);
  }

  async findByKey(workspaceId: string, projectId: string, key: string) {
    const row = await this.db.constructionProjectsDocument.findFirst({
      where: { fileKey: key, workspaceId, projectId },
    });
    return row == null ? null : toDocument(row);
  }

  async add(
    input: Parameters<ProjectDocumentStore["add"]>[0],
  ): Promise<"added" | "duplicate"> {
    const { document } = input;
    try {
      await this.db.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
          SELECT id::text AS id FROM construction_projects.projects
          WHERE id = ${document.projectId}::uuid
            AND workspace_id = ${document.workspaceId}
            AND deleted_at IS NULL
          FOR UPDATE
        `);
        if (locked.length === 0)
          throw notFound("PROJECT_NOT_FOUND", "This Project was not found.");
        const live = await tx.constructionProjectsDocument.count({
          where: {
            workspaceId: document.workspaceId,
            projectId: document.projectId,
            deletedAt: null,
          },
        });
        if (live >= input.maxDocuments)
          throw conflict(
            "DOCUMENTS_LIMIT",
            `Keep at most ${String(input.maxDocuments)} documents on a Project. Delete one first.`,
          );
        await tx.constructionProjectsDocument.create({
          data: {
            id: document.id,
            workspaceId: document.workspaceId,
            projectId: document.projectId,
            kind: document.kind,
            fileKey: document.fileKey,
            fileName: document.fileName,
            contentType: document.contentType,
            bytes: document.bytes,
            createdAt: document.createdAt,
            createdBy: document.createdBy,
          },
        });
        await recordStoredFile(tx, input.file);
        await recordAudit(tx, input.audit);
      });
      return "added";
    } catch (error) {
      if (isUniqueViolation(error)) return "duplicate";
      throw error;
    }
  }

  async remove(
    input: Parameters<ProjectDocumentStore["remove"]>[0],
  ): Promise<boolean> {
    const { document } = input;
    return this.db.$transaction(async (tx) => {
      const written = await tx.constructionProjectsDocument.updateMany({
        where: {
          id: document.id,
          workspaceId: document.workspaceId,
          projectId: document.projectId,
          deletedAt: null,
        },
        data: { deletedAt: input.now, deletedBy: input.by },
      });
      if (written.count === 0) return false;
      await markStoredFileDeleted(
        tx,
        document.workspaceId,
        document.fileKey,
        input.now,
      );
      await recordAudit(tx, input.audit);
      return true;
    });
  }
}
