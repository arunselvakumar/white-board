import type { PrismaClient } from "@repo/construction-db";

import { newId } from "../ids";

/**
 * A file a Company keeps in storage, recorded in
 * `construction_organization.stored_files` so storage usage (CM-116) is one
 * query. Written in the same transaction as the record that points at it,
 * like `recordAudit`.
 */
export type NewStoredFile = {
  workspaceId: string;
  key: string;
  /** What the file is for: `company_logo`, `member_photo`, … */
  kind: string;
  contentType: string;
  bytes: number;
  createdBy: string;
  createdAt?: Date;
};

type FileWriter = Pick<PrismaClient, "constructionOrganizationStoredFile">;

export async function recordStoredFile(
  db: FileWriter,
  file: NewStoredFile,
): Promise<void> {
  await db.constructionOrganizationStoredFile.create({
    data: {
      id: newId(),
      workspaceId: file.workspaceId,
      key: file.key,
      kind: file.kind,
      contentType: file.contentType,
      bytes: file.bytes,
      createdBy: file.createdBy,
      createdAt: file.createdAt ?? new Date(),
    },
  });
}

/** A replaced or removed file stops counting towards storage. */
export async function markStoredFileDeleted(
  db: FileWriter,
  workspaceId: string,
  key: string,
  now: Date = new Date(),
): Promise<void> {
  await db.constructionOrganizationStoredFile.updateMany({
    where: { workspaceId, key, deletedAt: null },
    data: { deletedAt: now },
  });
}

/**
 * `stored_files` kinds that do not count towards storage: backups and data
 * exports (ADR CM-0021 §8), which expire after 7 days.
 */
export const UNMETERED_FILE_KINDS: readonly string[] = ["backup"];

/** Bytes of the Company's live files (backups left out). */
export async function storedBytes(
  db: FileWriter,
  workspaceId: string,
): Promise<number> {
  const result = await db.constructionOrganizationStoredFile.aggregate({
    where: {
      workspaceId,
      deletedAt: null,
      kind: { notIn: [...UNMETERED_FILE_KINDS] },
    },
    _sum: { bytes: true },
  });
  return result._sum.bytes ?? 0;
}
