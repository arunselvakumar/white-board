import { Prisma, type PrismaClient } from "@repo/construction-db";

import { recordAudit } from "@/src/shared-kernel/audit";
import { conflict, notFound } from "@/src/shared-kernel/domain-error";
import {
  markStoredFileDeleted,
  recordStoredFile,
} from "@/src/shared-kernel/files/stored-files";

import {
  albumNotFound,
  drawingNotFound,
  type AlbumWithCount,
  type DrawingStore,
  type DrawingWithLatest,
  type DrawingWithRevisions,
} from "../application/project-drawings";
import type { Drawing, DrawingAlbum, DrawingRevision } from "../domain/drawing";
import { indexMedia, unindexMedia } from "./prisma-media-index";

type Tx = Prisma.TransactionClient;
type AlbumRow = Prisma.ConstructionProjectsDrawingAlbumGetPayload<object>;
type DrawingRow = Prisma.ConstructionProjectsDrawingGetPayload<object>;
type RevisionRow = Prisma.ConstructionProjectsDrawingRevisionGetPayload<object>;

function toAlbum(row: AlbumRow): DrawingAlbum {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    name: row.name,
    isSeed: row.isSeed,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toDrawing(row: DrawingRow): Drawing {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    albumId: row.albumId,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
  };
}

function toRevision(row: RevisionRow): DrawingRevision {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    drawingId: row.drawingId,
    revision: row.revision,
    fileKey: row.fileKey,
    fileName: row.fileName,
    contentType: row.contentType,
    bytes: row.bytes,
    thumbKey: row.thumbKey,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

const albumNameInUse = () =>
  conflict(
    "ALBUM_NAME_IN_USE",
    "An album with this name is already on the Project.",
  );

const albumChanged = () =>
  conflict(
    "ALBUM_CHANGED",
    "Someone changed this album since you opened it. Reload and try again.",
  );

const drawingChanged = () =>
  conflict(
    "DRAWING_CHANGED",
    "Someone changed this drawing since you opened it. Reload and try again.",
  );

/** Holds the Project for the transaction; 404 once it is gone. */
async function lockProject(
  tx: Tx,
  workspaceId: string,
  projectId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id::text AS id FROM construction_projects.projects
    WHERE id = ${projectId}::uuid AND workspace_id = ${workspaceId}
      AND deleted_at IS NULL
    FOR SHARE
  `);
  if (rows.length === 0)
    throw notFound("PROJECT_NOT_FOUND", "This Project was not found.");
}

/** Holds a live album against deletion; 404 `ALBUM_NOT_FOUND` otherwise. */
async function lockAlbum(
  tx: Tx,
  workspaceId: string,
  projectId: string,
  albumId: string,
  mode: "share" | "update",
): Promise<void> {
  const lock =
    mode === "share" ? Prisma.sql`FOR SHARE` : Prisma.sql`FOR UPDATE`;
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id::text AS id FROM construction_projects.drawing_albums
    WHERE id = ${albumId}::uuid AND workspace_id = ${workspaceId}
      AND project_id = ${projectId}::uuid AND deleted_at IS NULL
    ${lock}
  `);
  if (rows.length === 0) throw albumNotFound();
}

async function writeRevision(
  tx: Tx,
  projectId: string,
  revision: DrawingRevision,
  files: Parameters<DrawingStore["addDrawing"]>[0]["files"],
): Promise<void> {
  await tx.constructionProjectsDrawingRevision.create({
    data: {
      id: revision.id,
      workspaceId: revision.workspaceId,
      drawingId: revision.drawingId,
      revision: revision.revision,
      fileKey: revision.fileKey,
      fileName: revision.fileName,
      contentType: revision.contentType,
      bytes: revision.bytes,
      thumbKey: revision.thumbKey,
      createdAt: revision.createdAt,
      createdBy: revision.createdBy,
    },
  });
  for (const file of files) await recordStoredFile(tx, file);
  await indexMedia(tx, {
    workspaceId: revision.workspaceId,
    projectId,
    source: "drawing",
    sourceId: revision.drawingId,
    fileKey: revision.fileKey,
    thumbKey: revision.thumbKey,
    fileName: revision.fileName,
    contentType: revision.contentType,
    bytes: revision.bytes,
    uploadedBy: revision.createdBy,
    uploadedAt: revision.createdAt,
  });
}

/**
 * `construction_projects.drawing_albums`, `drawings` and
 * `drawing_revisions` (CM-408). Adding a drawing holds the Project and its
 * album, so an album deleted meanwhile gets no drawing; deleting an album
 * holds it while counting its drawings.
 */
export class PrismaDrawingStore implements DrawingStore {
  constructor(private readonly db: PrismaClient) {}

  async listAlbums(
    workspaceId: string,
    projectId: string,
  ): Promise<AlbumWithCount[]> {
    const rows = await this.db.constructionProjectsDrawingAlbum.findMany({
      where: { workspaceId, projectId, deletedAt: null },
      include: {
        _count: { select: { drawings: { where: { deletedAt: null } } } },
      },
    });
    return rows
      .map((row) => ({ ...toAlbum(row), drawingCount: row._count.drawings }))
      .sort((a, b) =>
        a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
      );
  }

  async findAlbum(workspaceId: string, projectId: string, albumId: string) {
    const row = await this.db.constructionProjectsDrawingAlbum.findFirst({
      where: { id: albumId, workspaceId, projectId, deletedAt: null },
    });
    return row == null ? null : toAlbum(row);
  }

  async insertAlbum(
    album: DrawingAlbum,
    by: string,
    audit: Parameters<DrawingStore["insertAlbum"]>[2],
  ) {
    try {
      await this.db.$transaction(async (tx) => {
        await lockProject(tx, album.workspaceId, album.projectId);
        await tx.constructionProjectsDrawingAlbum.create({
          data: {
            id: album.id,
            workspaceId: album.workspaceId,
            projectId: album.projectId,
            name: album.name,
            isSeed: album.isSeed,
            createdAt: album.createdAt,
            updatedAt: album.updatedAt,
            createdBy: by,
            updatedBy: by,
          },
        });
        await recordAudit(tx, audit);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw albumNameInUse();
      throw error;
    }
  }

  async renameAlbum(input: Parameters<DrawingStore["renameAlbum"]>[0]) {
    const { album } = input;
    try {
      return await this.db.$transaction(async (tx) => {
        const written = await tx.constructionProjectsDrawingAlbum.updateMany({
          where: {
            id: album.id,
            workspaceId: album.workspaceId,
            deletedAt: null,
            updatedAt: input.expectedUpdatedAt,
          },
          data: { name: input.name, updatedAt: input.now, updatedBy: input.by },
        });
        if (written.count === 0) throw albumChanged();
        await recordAudit(tx, input.audit);
        return { ...album, name: input.name, updatedAt: input.now };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw albumNameInUse();
      throw error;
    }
  }

  async deleteAlbum(input: Parameters<DrawingStore["deleteAlbum"]>[0]) {
    const { album } = input;
    await this.db.$transaction(async (tx) => {
      await lockAlbum(
        tx,
        album.workspaceId,
        album.projectId,
        album.id,
        "update",
      );
      const drawings = await tx.constructionProjectsDrawing.count({
        where: { albumId: album.id, deletedAt: null },
      });
      if (drawings > 0)
        throw conflict(
          "ALBUM_NOT_EMPTY",
          "This album has drawings. Move or delete them first.",
          { drawings },
        );
      await tx.constructionProjectsDrawingAlbum.update({
        where: { id: album.id },
        data: {
          deletedAt: input.now,
          deletedBy: input.by,
          updatedAt: input.now,
          updatedBy: input.by,
        },
      });
      await recordAudit(tx, input.audit);
    });
  }

  async listDrawings(
    workspaceId: string,
    projectId: string,
    albumId: string,
  ): Promise<DrawingWithLatest[]> {
    const rows = await this.db.constructionProjectsDrawing.findMany({
      where: { workspaceId, projectId, albumId, deletedAt: null },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      include: {
        revisions: {
          where: { deletedAt: null },
          orderBy: { revision: "desc" },
          take: 1,
        },
        _count: { select: { revisions: { where: { deletedAt: null } } } },
      },
    });
    return rows.flatMap((row) => {
      const latest = row.revisions[0];
      return latest == null
        ? []
        : [
            {
              ...toDrawing(row),
              latest: toRevision(latest),
              revisionCount: row._count.revisions,
            },
          ];
    });
  }

  async findDrawing(
    workspaceId: string,
    projectId: string,
    drawingId: string,
  ): Promise<DrawingWithRevisions | null> {
    const row = await this.db.constructionProjectsDrawing.findFirst({
      where: { id: drawingId, workspaceId, projectId, deletedAt: null },
      include: {
        revisions: {
          where: { deletedAt: null },
          orderBy: { revision: "desc" },
        },
      },
    });
    return row == null
      ? null
      : { ...toDrawing(row), revisions: row.revisions.map(toRevision) };
  }

  async findRevisionByKey(workspaceId: string, projectId: string, key: string) {
    const row = await this.db.constructionProjectsDrawingRevision.findFirst({
      where: { fileKey: key, workspaceId, drawing: { projectId } },
      include: { drawing: true },
    });
    if (row == null) return null;
    return {
      revision: toRevision(row),
      drawing: toDrawing(row.drawing),
      deleted: row.deletedAt != null || row.drawing.deletedAt != null,
    };
  }

  async addDrawing(
    input: Parameters<DrawingStore["addDrawing"]>[0],
  ): Promise<"added" | "duplicate"> {
    const { drawing } = input;
    try {
      await this.db.$transaction(async (tx) => {
        await lockProject(tx, drawing.workspaceId, drawing.projectId);
        await lockAlbum(
          tx,
          drawing.workspaceId,
          drawing.projectId,
          drawing.albumId,
          "share",
        );
        await tx.constructionProjectsDrawing.create({
          data: {
            id: drawing.id,
            workspaceId: drawing.workspaceId,
            projectId: drawing.projectId,
            albumId: drawing.albumId,
            name: drawing.name,
            createdAt: drawing.createdAt,
            updatedAt: drawing.updatedAt,
            createdBy: drawing.createdBy,
            updatedBy: drawing.createdBy,
          },
        });
        await writeRevision(tx, drawing.projectId, input.revision, input.files);
        await recordAudit(tx, input.audit);
      });
      return "added";
    } catch (error) {
      if (isUniqueViolation(error)) return "duplicate";
      throw error;
    }
  }

  async addRevision(
    input: Parameters<DrawingStore["addRevision"]>[0],
  ): Promise<DrawingRevision | "duplicate"> {
    const { revision } = input;
    try {
      return await this.db.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<
          { projectId: string; next: number }[]
        >(Prisma.sql`
          SELECT d.project_id::text AS "projectId",
            COALESCE((SELECT MAX(r.revision) FROM construction_projects.drawing_revisions r
                      WHERE r.drawing_id = d.id), 0)::int + 1 AS "next"
          FROM construction_projects.drawings d
          WHERE d.id = ${revision.drawingId}::uuid
            AND d.workspace_id = ${revision.workspaceId}
            AND d.deleted_at IS NULL
          FOR UPDATE OF d
        `);
        const found = locked[0];
        if (found == null) throw drawingNotFound();
        const stored: DrawingRevision = { ...revision, revision: found.next };
        await writeRevision(tx, found.projectId, stored, input.files);
        await tx.constructionProjectsDrawing.update({
          where: { id: revision.drawingId },
          data: {
            updatedAt: revision.createdAt,
            updatedBy: revision.createdBy,
          },
        });
        await recordAudit(tx, input.audit(found.next));
        return stored;
      });
    } catch (error) {
      if (isUniqueViolation(error)) return "duplicate";
      throw error;
    }
  }

  async updateDrawing(input: Parameters<DrawingStore["updateDrawing"]>[0]) {
    const { drawing } = input;
    return this.db.$transaction(async (tx) => {
      if (input.albumId !== drawing.albumId)
        await lockAlbum(
          tx,
          drawing.workspaceId,
          drawing.projectId,
          input.albumId,
          "share",
        );
      const written = await tx.constructionProjectsDrawing.updateMany({
        where: {
          id: drawing.id,
          workspaceId: drawing.workspaceId,
          deletedAt: null,
          updatedAt: input.expectedUpdatedAt,
        },
        data: {
          name: input.name,
          albumId: input.albumId,
          updatedAt: input.now,
          updatedBy: input.by,
        },
      });
      if (written.count === 0) throw drawingChanged();
      await recordAudit(tx, input.audit);
      return {
        ...drawing,
        name: input.name,
        albumId: input.albumId,
        updatedAt: input.now,
      };
    });
  }

  async deleteDrawing(
    input: Parameters<DrawingStore["deleteDrawing"]>[0],
  ): Promise<boolean> {
    const { drawing } = input;
    return this.db.$transaction(async (tx) => {
      const written = await tx.constructionProjectsDrawing.updateMany({
        where: {
          id: drawing.id,
          workspaceId: drawing.workspaceId,
          deletedAt: null,
        },
        data: {
          deletedAt: input.now,
          deletedBy: input.by,
          updatedAt: input.now,
          updatedBy: input.by,
        },
      });
      if (written.count === 0) return false;
      await tx.constructionProjectsDrawingRevision.updateMany({
        where: { drawingId: drawing.id, deletedAt: null },
        data: { deletedAt: input.now, deletedBy: input.by },
      });
      for (const revision of drawing.revisions) {
        await markStoredFileDeleted(
          tx,
          drawing.workspaceId,
          revision.fileKey,
          input.now,
        );
        if (revision.thumbKey != null)
          await markStoredFileDeleted(
            tx,
            drawing.workspaceId,
            revision.thumbKey,
            input.now,
          );
      }
      await unindexMedia(tx, {
        workspaceId: drawing.workspaceId,
        source: "drawing",
        sourceId: drawing.id,
        now: input.now,
      });
      await recordAudit(tx, input.audit);
      return true;
    });
  }
}
