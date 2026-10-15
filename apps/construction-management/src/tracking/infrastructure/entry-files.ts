import { markStoredFileDeleted } from "@/src/shared-kernel/files/stored-files";

import type { TrackingTx } from "../application/ports";
import {
  TRACKING_ENTRY_FILES_MAX,
  entryFilesNotFound,
  entryFilesTooMany,
  type TrackingDocumentFile,
} from "../domain/document-files";
import type { TrackingDocumentType } from "../domain/tracking-documents";
import {
  OLDEST_FIRST,
  liveTrackingFile,
  ofTrackingDocument,
} from "./document-files-store";

/** The document an entry belongs to. */
export type TrackingEntryDocument = {
  workspaceId: string;
  type: TrackingDocumentType;
  documentId: string;
};

/**
 * Attaches files to a new entry — a task's progress update, an issue's
 * update, an inspection's observation — inside the caller's transaction
 * (the one that inserts the entry). Each id must be a live file of the
 * document, posted with no entry yet, and uploaded by `by`: 400
 * `DOCUMENT_FILE_NOT_FOUND` with `details.fileIds` naming the others; 400
 * `ENTRY_FILES_TOO_MANY` above 10. Returns the files, oldest first.
 *
 * The client uploads first (`useTrackingFileUploads` /
 * `TrackingEntryFilesField`), then posts the entry with the ids.
 */
export async function attachEntryFiles(
  tx: TrackingTx,
  input: TrackingEntryDocument & {
    entryId: string;
    fileIds: readonly string[];
    by: string;
  },
): Promise<TrackingDocumentFile[]> {
  const fileIds = [...new Set(input.fileIds)];
  if (fileIds.length === 0) return [];
  if (fileIds.length > TRACKING_ENTRY_FILES_MAX) throw entryFilesTooMany();
  const rows = await tx.constructionTrackingDocumentFile.findMany({
    where: {
      id: { in: fileIds },
      ...ofTrackingDocument(input.workspaceId, input.type, input.documentId),
      entryId: null,
      createdBy: input.by,
      deletedAt: null,
    },
    orderBy: OLDEST_FIRST,
  });
  if (rows.length !== fileIds.length) {
    const found = new Set(rows.map((row) => row.id));
    throw entryFilesNotFound(fileIds.filter((id) => !found.has(id)));
  }
  await tx.constructionTrackingDocumentFile.updateMany({
    where: { id: { in: fileIds }, entryId: null },
    data: { entryId: input.entryId },
  });
  return rows.map((row) => ({
    ...liveTrackingFile(row),
    entryId: input.entryId,
  }));
}

/**
 * Tombstones the live files of one entry (when the entry is deleted), or of
 * the whole document when `entryId` is omitted, inside the caller's
 * transaction; their bytes stop counting against the plan. Returns them so
 * the caller can take them out of the Gallery after commit:
 * `files.dispatchRemoved(trackingFilesMediaRemoved(removed, at))`. The
 * objects stay in storage, as a deleted document's do.
 */
export async function tombstoneEntryFiles(
  tx: TrackingTx,
  input: TrackingEntryDocument & {
    entryId?: string;
    by: string;
    at: Date;
  },
): Promise<TrackingDocumentFile[]> {
  const where = {
    ...ofTrackingDocument(input.workspaceId, input.type, input.documentId),
    ...(input.entryId == null ? {} : { entryId: input.entryId }),
    deletedAt: null,
  };
  const rows = await tx.constructionTrackingDocumentFile.findMany({
    where,
    orderBy: OLDEST_FIRST,
  });
  if (rows.length === 0) return [];
  await tx.constructionTrackingDocumentFile.updateMany({
    where: { id: { in: rows.map((row) => row.id) }, deletedAt: null },
    data: { deletedAt: input.at, deletedBy: input.by },
  });
  for (const row of rows) {
    await markStoredFileDeleted(tx, row.workspaceId, row.fileKey, input.at);
    if (row.thumbKey != null)
      await markStoredFileDeleted(tx, row.workspaceId, row.thumbKey, input.at);
  }
  return rows.map(liveTrackingFile);
}

/** An entry's live files, oldest first (for an entry list or detail). */
export async function entryFiles(
  tx: TrackingTx,
  input: TrackingEntryDocument & { entryIds: readonly string[] },
): Promise<Map<string, TrackingDocumentFile[]>> {
  const byEntry = new Map<string, TrackingDocumentFile[]>();
  if (input.entryIds.length === 0) return byEntry;
  const rows = await tx.constructionTrackingDocumentFile.findMany({
    where: {
      ...ofTrackingDocument(input.workspaceId, input.type, input.documentId),
      entryId: { in: [...input.entryIds] },
      deletedAt: null,
    },
    orderBy: OLDEST_FIRST,
  });
  for (const row of rows) {
    if (row.entryId == null) continue;
    const list = byEntry.get(row.entryId) ?? [];
    list.push(liveTrackingFile(row));
    byEntry.set(row.entryId, list);
  }
  return byEntry;
}
