import type { PrismaClient } from "@repo/construction-db";

import { recordAudit } from "@/src/shared-kernel/audit";
import { conflict } from "@/src/shared-kernel/domain-error";
import {
  markStoredFileDeleted,
  recordStoredFile,
} from "@/src/shared-kernel/files/stored-files";

import type {
  PartyDocumentRecord,
  PartyFilesStore,
  PartyRef,
} from "../application/party-files";

/**
 * `photo_key` on `labours` / `vendors` and the `documents` rows, each write
 * in one transaction with its `stored_files` row and audit event.
 */
export class PrismaPartyFilesStore implements PartyFilesStore {
  constructor(private readonly db: PrismaClient) {}

  async owner(ref: PartyRef): Promise<{ photoKey: string | null } | null> {
    const where = {
      id: ref.ownerId,
      workspaceId: ref.workspaceId,
      deletedAt: null,
    };
    const select = { photoKey: true } as const;
    const row =
      ref.ownerType === "labour"
        ? await this.db.constructionLabourLabour.findFirst({ where, select })
        : await this.db.constructionLabourVendor.findFirst({ where, select });
    return row ?? null;
  }

  async setPhoto(input: Parameters<PartyFilesStore["setPhoto"]>[0]) {
    const { ref } = input;
    await this.db.$transaction(async (tx) => {
      const where = {
        id: ref.ownerId,
        workspaceId: ref.workspaceId,
        deletedAt: null,
        photoKey: input.loadedKey,
      };
      // `updated_at` stays: it guards edits of the details, not the photo.
      const data = { photoKey: input.key };
      const written =
        ref.ownerType === "labour"
          ? await tx.constructionLabourLabour.updateMany({ where, data })
          : await tx.constructionLabourVendor.updateMany({ where, data });
      if (written.count === 0)
        throw conflict(
          "PHOTO_CHANGED",
          "The photo was changed somewhere else. Reload and try again.",
        );
      if (input.removedKey != null)
        await markStoredFileDeleted(
          tx,
          ref.workspaceId,
          input.removedKey,
          input.now,
        );
      if (input.added != null) await recordStoredFile(tx, input.added);
      await recordAudit(tx, input.audit);
    });
  }

  async documents(ref: PartyRef): Promise<PartyDocumentRecord[]> {
    const rows = await this.db.constructionLabourDocument.findMany({
      where: {
        workspaceId: ref.workspaceId,
        ownerType: ref.ownerType,
        ownerId: ref.ownerId,
        deletedAt: null,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map(toRecord);
  }

  async document(
    ref: PartyRef,
    id: string,
  ): Promise<PartyDocumentRecord | null> {
    const row = await this.db.constructionLabourDocument.findFirst({
      where: {
        id,
        workspaceId: ref.workspaceId,
        ownerType: ref.ownerType,
        ownerId: ref.ownerId,
        deletedAt: null,
      },
    });
    return row == null ? null : toRecord(row);
  }

  async addDocument(input: Parameters<PartyFilesStore["addDocument"]>[0]) {
    const { ref, document } = input;
    await this.db.$transaction(async (tx) => {
      await tx.constructionLabourDocument.create({
        data: {
          id: document.id,
          workspaceId: ref.workspaceId,
          ownerType: ref.ownerType,
          ownerId: ref.ownerId,
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
  }

  async removeDocument(
    input: Parameters<PartyFilesStore["removeDocument"]>[0],
  ): Promise<boolean> {
    const { ref, document } = input;
    return this.db.$transaction(async (tx) => {
      const written = await tx.constructionLabourDocument.updateMany({
        where: {
          id: document.id,
          workspaceId: ref.workspaceId,
          ownerType: ref.ownerType,
          ownerId: ref.ownerId,
          deletedAt: null,
        },
        data: { deletedAt: input.now },
      });
      if (written.count === 0) return false;
      await markStoredFileDeleted(
        tx,
        ref.workspaceId,
        document.fileKey,
        input.now,
      );
      await recordAudit(tx, input.audit);
      return true;
    });
  }
}

function toRecord(row: {
  id: string;
  fileKey: string;
  fileName: string;
  contentType: string;
  bytes: number;
  createdAt: Date;
  createdBy: string;
}): PartyDocumentRecord {
  return {
    id: row.id,
    fileKey: row.fileKey,
    fileName: row.fileName,
    contentType: row.contentType,
    bytes: row.bytes,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
  };
}
