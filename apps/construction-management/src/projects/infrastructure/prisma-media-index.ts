import { Prisma, type PrismaClient } from "@repo/construction-db";

import { newId } from "@/src/shared-kernel/ids";
import { isGalleryContentType } from "@/src/shared-kernel/project-media";

import type { NewMediaItem } from "../domain/media-item";
import type { ProjectMediaStore } from "../application/project-media-listener";

type MediaWriter = Pick<PrismaClient, "constructionProjectsMediaItem">;

/**
 * Adds a file to the Gallery index (ADR CM-0014) inside the caller's
 * transaction. Only PDFs and images are indexed; anything else is left
 * out. A key already indexed is left as it is, so a replayed event or a
 * retried completion never fails.
 */
export async function indexMedia(
  db: MediaWriter,
  item: NewMediaItem,
): Promise<void> {
  if (!isGalleryContentType(item.contentType)) return;
  await db.constructionProjectsMediaItem.createMany({
    data: [
      {
        id: newId(item.uploadedAt.getTime()),
        workspaceId: item.workspaceId,
        projectId: item.projectId,
        source: item.source,
        sourceId: item.sourceId,
        fileKey: item.fileKey,
        thumbKey: item.thumbKey,
        fileName: item.fileName,
        contentType: item.contentType,
        bytes: item.bytes,
        uploadedBy: item.uploadedBy,
        uploadedAt: item.uploadedAt,
      },
    ],
    skipDuplicates: true,
  });
}

/**
 * Tombstones Gallery rows inside the caller's transaction: every row of
 * the record, or the one at `fileKey`.
 */
export async function unindexMedia(
  db: MediaWriter,
  input: {
    workspaceId: string;
    source: string;
    sourceId: string;
    fileKey?: string;
    now: Date;
  },
): Promise<void> {
  await db.constructionProjectsMediaItem.updateMany({
    where: {
      workspaceId: input.workspaceId,
      source: input.source,
      sourceId: input.sourceId,
      ...(input.fileKey == null ? {} : { fileKey: input.fileKey }),
      deletedAt: null,
    },
    data: { deletedAt: input.now },
  });
}

/**
 * The Gallery index for `ProjectMediaAttached` / `ProjectMediaRemoved`
 * from other contexts. A row is written only for a live Project of the
 * same Company.
 */
export class PrismaProjectMediaStore implements ProjectMediaStore {
  constructor(private readonly db: PrismaClient) {}

  async attach(item: NewMediaItem): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const project = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT id::text AS id FROM construction_projects.projects
        WHERE id = ${item.projectId}::uuid
          AND workspace_id = ${item.workspaceId}
          AND deleted_at IS NULL
        FOR SHARE
      `);
      if (project.length === 0) return;
      await indexMedia(tx, item);
    });
  }

  async remove(input: {
    workspaceId: string;
    source: string;
    sourceId: string;
    fileKey?: string;
    now: Date;
  }): Promise<void> {
    await unindexMedia(this.db, input);
  }
}
