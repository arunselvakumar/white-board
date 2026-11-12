import { Prisma, type PrismaClient } from "@repo/construction-db";

import { recordAudit } from "@/src/shared-kernel/audit";
import {
  markStoredFileDeleted,
  recordStoredFile,
} from "@/src/shared-kernel/files/stored-files";
import { isUniqueViolation } from "@/src/shared-kernel/prisma-errors";

import type { VisitFileStore } from "../application/ports";
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
      await this.db.$transaction(async (tx) => {
        // The Visit's row, so two uploads cannot both take the 20th place.
        await tx.$queryRaw(Prisma.sql`
          SELECT id FROM construction_marketing.visits
          WHERE workspace_id = ${file.workspaceId}
            AND id = ${file.visitId}::uuid
          FOR UPDATE`);
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
      });
      return "added";
    } catch (error) {
      if (isUniqueViolation(error)) return "duplicate";
      throw error;
    }
  }

  async setCaption(input: Parameters<VisitFileStore["setCaption"]>[0]) {
    await this.db.$transaction(async (tx) => {
      await tx.constructionMarketingVisitFile.update({
        where: { id: input.file.id },
        data: { caption: input.caption, updatedAt: input.now },
      });
      await recordAudit(tx, input.audit);
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
}
