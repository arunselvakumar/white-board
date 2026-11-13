import { Prisma, type PrismaClient } from "@repo/construction-db";

import { recordAudit } from "@/src/shared-kernel/audit";
import {
  markStoredFileDeleted,
  recordStoredFile,
} from "@/src/shared-kernel/files/stored-files";
import { isUniqueViolation } from "@/src/shared-kernel/prisma-errors";

import type { MarketingTx, VisitFileStore } from "../application/ports";
import { visitNotFound } from "../domain/visit";
import { VISIT_FILE_LIMIT, visitFileLimit } from "../domain/visit-files";

const FILE_SELECT = {
  id: true,
  workspaceId: true,
  visitId: true,
  fileKey: true,
  fileName: true,
  contentType: true,
  bytes: true,
  thumbKey: true,
  caption: true,
  createdAt: true,
  createdBy: true,
  updatedAt: true,
} as const satisfies Prisma.ConstructionMarketingVisitFileSelect;

/** `construction_marketing.visit_files` (ADR CM-0040 §9). */
export class PrismaVisitFileStore implements VisitFileStore {
  constructor(private readonly db: PrismaClient) {}

  files(workspaceId: string, visitIds: readonly string[]) {
    if (visitIds.length === 0) return Promise.resolve([]);
    return this.db.constructionMarketingVisitFile.findMany({
      where: { workspaceId, visitId: { in: [...visitIds] }, deletedAt: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: FILE_SELECT,
    });
  }

  file(workspaceId: string, visitId: string, fileId: string) {
    return this.db.constructionMarketingVisitFile.findFirst({
      where: { id: fileId, workspaceId, visitId, deletedAt: null },
      select: FILE_SELECT,
    });
  }

  fileByKey(workspaceId: string, visitId: string, key: string) {
    return this.db.constructionMarketingVisitFile.findFirst({
      where: { fileKey: key, workspaceId, visitId },
      select: { ...FILE_SELECT, deletedAt: true },
    });
  }

  countFiles(workspaceId: string, visitId: string) {
    return this.db.constructionMarketingVisitFile.count({
      where: { workspaceId, visitId, deletedAt: null },
    });
  }

  async addFile(
    input: Parameters<VisitFileStore["addFile"]>[0],
  ): Promise<"added" | "duplicate"> {
    const { file } = input;
    try {
      return await this.db.$transaction(async (tx) => {
        // The live Visit's row, so two uploads cannot both take the 20th
        // place and a Visit deleted meanwhile gets no file.
        const locked = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
          SELECT id FROM construction_marketing.visits
          WHERE workspace_id = ${file.workspaceId}
            AND id = ${file.visitId}::uuid
            AND deleted_at IS NULL
          FOR UPDATE`);
        if (locked.length === 0) throw visitNotFound();
        // A retry of a key recorded meanwhile is a duplicate, not a 21st.
        const recorded = await tx.constructionMarketingVisitFile.count({
          where: { fileKey: file.fileKey },
        });
        if (recorded > 0) return "duplicate" as const;
        const live = await tx.constructionMarketingVisitFile.count({
          where: {
            workspaceId: file.workspaceId,
            visitId: file.visitId,
            deletedAt: null,
          },
        });
        if (live >= VISIT_FILE_LIMIT) throw visitFileLimit();
        await tx.constructionMarketingVisitFile.create({ data: file });
        for (const stored of input.storedFiles)
          await recordStoredFile(tx, stored);
        await recordAudit(tx, input.audit);
        return "added" as const;
      });
    } catch (error) {
      if (isUniqueViolation(error)) return "duplicate";
      throw error;
    }
  }

  setCaption(input: Parameters<VisitFileStore["setCaption"]>[0]) {
    const { file } = input;
    return this.db.$transaction(async (tx) => {
      // Only a live file: one removed meanwhile keeps its tombstone as is.
      const written = await tx.constructionMarketingVisitFile.updateMany({
        where: {
          id: file.id,
          workspaceId: file.workspaceId,
          visitId: file.visitId,
          deletedAt: null,
        },
        data: { caption: input.caption, updatedAt: input.now },
      });
      if (written.count === 0) return false;
      await recordAudit(tx, input.audit);
      return true;
    });
  }

  removeFile(input: Parameters<VisitFileStore["removeFile"]>[0]) {
    const { file } = input;
    return this.db.$transaction(async (tx) => {
      const written = await tx.constructionMarketingVisitFile.updateMany({
        where: {
          id: file.id,
          workspaceId: file.workspaceId,
          visitId: file.visitId,
          deletedAt: null,
        },
        data: {
          deletedAt: input.now,
          deletedBy: input.by,
          updatedAt: input.now,
        },
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

  async removeFilesOfVisit(
    tx: MarketingTx,
    input: Parameters<VisitFileStore["removeFilesOfVisit"]>[1],
  ) {
    const where = {
      workspaceId: input.workspaceId,
      visitId: input.visitId,
      deletedAt: null,
    };
    const files = await tx.constructionMarketingVisitFile.findMany({
      where,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, fileKey: true, thumbKey: true },
    });
    if (files.length === 0) return [];
    await tx.constructionMarketingVisitFile.updateMany({
      where: { ...where, id: { in: files.map((file) => file.id) } },
      data: {
        deletedAt: input.now,
        deletedBy: input.by,
        updatedAt: input.now,
      },
    });
    for (const file of files)
      for (const key of [file.fileKey, file.thumbKey])
        if (key != null)
          await markStoredFileDeleted(tx, input.workspaceId, key, input.now);
    return files;
  }
}
