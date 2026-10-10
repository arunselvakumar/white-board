import {
  AttachmentUploads,
  storedFilesOf,
  type CheckedUpload,
  type StartedUpload,
  type UploadTarget,
} from "@/src/shared-kernel/attachments";
import type { AuditEvent } from "@/src/shared-kernel/audit";
import { notFound } from "@/src/shared-kernel/domain-error";
import type {
  NewStoredFile,
  ObjectStorage,
  StoredObject,
} from "@/src/shared-kernel/files";
import { newId } from "@/src/shared-kernel/ids";
import type { PlanGate } from "@/src/shared-kernel/plan";

import {
  albumName,
  drawingName,
  drawingNameFromFile,
  revisionLabel,
  type Drawing,
  type DrawingAlbum,
  type DrawingRevision,
} from "../domain/drawing";
import type { ProjectRepository } from "../domain/project-repository";
import { DRAWING_POLICY } from "../domain/project-upload-policies";
import { thumbnailNotFound, type UploaderNames } from "./project-documents";
import type { ProjectViewer } from "./project-handlers";
import { assertProjectVisible } from "./project-visibility";

/** `stored_files.kind` of a drawing revision. */
export const DRAWING_FILE_KIND = "drawing_revision";

export type AlbumWithCount = DrawingAlbum & { drawingCount: number };

/** A drawing with its latest revision and how many it has. */
export type DrawingWithLatest = Drawing & {
  latest: DrawingRevision;
  revisionCount: number;
};

/** A drawing with every revision, newest first. */
export type DrawingWithRevisions = Drawing & { revisions: DrawingRevision[] };

/** A revision at a key: the drawing it belongs to, live or deleted. */
export type RevisionAtKey = {
  revision: DrawingRevision;
  drawing: Drawing;
  deleted: boolean;
};

/**
 * The rows behind Project Drawings. Each write is one transaction with its
 * audit event; writes that add a file also write its `stored_files` rows
 * and, for a PDF or an image, its Gallery row (source `drawing`).
 */
export type DrawingStore = {
  /** Live albums with their live drawing counts, by name. */
  listAlbums(workspaceId: string, projectId: string): Promise<AlbumWithCount[]>;
  findAlbum(
    workspaceId: string,
    projectId: string,
    albumId: string,
  ): Promise<DrawingAlbum | null>;
  /** 409 `ALBUM_NAME_IN_USE` for a live name in the Project, ignoring case. */
  insertAlbum(
    album: DrawingAlbum,
    by: string,
    audit: AuditEvent,
  ): Promise<void>;
  /** 409 `ALBUM_CHANGED` on a stale `updatedAt`, `ALBUM_NAME_IN_USE`. */
  renameAlbum(input: {
    album: DrawingAlbum;
    name: string;
    expectedUpdatedAt: Date;
    by: string;
    now: Date;
    audit: AuditEvent;
  }): Promise<DrawingAlbum>;
  /** 409 `ALBUM_NOT_EMPTY` while it holds a live drawing. */
  deleteAlbum(input: {
    album: DrawingAlbum;
    by: string;
    now: Date;
    audit: AuditEvent;
  }): Promise<void>;
  /** Live drawings of an album with their latest revisions, newest change first. */
  listDrawings(
    workspaceId: string,
    projectId: string,
    albumId: string,
  ): Promise<DrawingWithLatest[]>;
  findDrawing(
    workspaceId: string,
    projectId: string,
    drawingId: string,
  ): Promise<DrawingWithRevisions | null>;
  findRevisionByKey(
    workspaceId: string,
    projectId: string,
    key: string,
  ): Promise<RevisionAtKey | null>;
  /**
   * A new drawing with its R1 while the Project and album are live (404
   * `PROJECT_NOT_FOUND` / `ALBUM_NOT_FOUND` otherwise). `duplicate` when
   * the key is already recorded.
   */
  addDrawing(input: {
    drawing: Drawing;
    revision: DrawingRevision;
    files: NewStoredFile[];
    audit: AuditEvent;
  }): Promise<"added" | "duplicate">;
  /**
   * The next revision of a live drawing (404 `DRAWING_NOT_FOUND`
   * otherwise), numbered inside the transaction; the drawing's
   * `updatedAt` moves on. Returns the stored revision, or `duplicate`.
   */
  addRevision(input: {
    revision: Omit<DrawingRevision, "revision">;
    files: NewStoredFile[];
    audit: (revision: number) => AuditEvent;
  }): Promise<DrawingRevision | "duplicate">;
  /**
   * Renames and / or moves a drawing. 409 `DRAWING_CHANGED` on a stale
   * `updatedAt`; 404 `ALBUM_NOT_FOUND` for a target album that is not a
   * live album of the Project.
   */
  updateDrawing(input: {
    drawing: Drawing;
    name: string;
    albumId: string;
    expectedUpdatedAt: Date;
    by: string;
    now: Date;
    audit: AuditEvent;
  }): Promise<Drawing>;
  /** Tombstones the drawing, its revisions, their stored files and Gallery rows. */
  deleteDrawing(input: {
    drawing: DrawingWithRevisions;
    by: string;
    now: Date;
    audit: AuditEvent;
  }): Promise<boolean>;
};

export type DrawingRevisionView = DrawingRevision & {
  label: string;
  /** A PDF or an image, which the viewer shows; DWG and DXF download. */
  viewable: boolean;
  createdByName: string | null;
};

export type DrawingView = Drawing & {
  latest: DrawingRevisionView;
  revisionCount: number;
};

export type DrawingDetailView = Drawing & {
  albumName: string;
  revisions: DrawingRevisionView[];
};

const VIEWABLE = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export const albumNotFound = () =>
  notFound("ALBUM_NOT_FOUND", "This album was not found.");

export const drawingNotFound = () =>
  notFound("DRAWING_NOT_FOUND", "This drawing was not found.");

function revisionView(
  revision: DrawingRevision,
  names: ReadonlyMap<string, string>,
): DrawingRevisionView {
  return {
    ...revision,
    label: revisionLabel(revision.revision),
    viewable: VIEWABLE.has(revision.contentType),
    createdByName: names.get(revision.createdBy) ?? null,
  };
}

/**
 * Project Drawings (CM-408, ADR CM-0013 §8). Albums hold drawings; a
 * drawing is a series of revisions uploaded through the attachments
 * service (policy `DRAWING_POLICY`: PDF, image, DWG or DXF, at most
 * 100 MB, in parts above 8 MB). The latest revision is shown; older ones
 * stay in the history and download. Every revision that is a PDF or an
 * image is in the Gallery.
 *
 * Routes check `projects.drawings` first (read, create, update, delete);
 * this applies Project visibility, so a Project the member is not on is
 * "not found".
 */
export class ProjectDrawings {
  private readonly uploads: AttachmentUploads;

  constructor(
    private readonly projects: Pick<ProjectRepository, "findById">,
    private readonly store: DrawingStore,
    storage: ObjectStorage,
    plan: PlanGate,
    private readonly names: UploaderNames,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.uploads = new AttachmentUploads(storage, plan, clock);
  }

  private target(viewer: ProjectViewer, projectId: string): UploadTarget {
    return {
      workspaceId: viewer.workspaceId,
      ownerId: projectId,
      policy: DRAWING_POLICY,
    };
  }

  private visible(viewer: ProjectViewer, projectId: string): Promise<void> {
    return assertProjectVisible(this.projects, viewer, projectId);
  }

  private async liveAlbum(
    viewer: ProjectViewer,
    projectId: string,
    albumId: string,
  ): Promise<DrawingAlbum> {
    await this.visible(viewer, projectId);
    const album = await this.store.findAlbum(
      viewer.workspaceId,
      projectId,
      albumId,
    );
    if (album == null) throw albumNotFound();
    return album;
  }

  private async liveDrawing(
    viewer: ProjectViewer,
    projectId: string,
    drawingId: string,
  ): Promise<DrawingWithRevisions> {
    await this.visible(viewer, projectId);
    const drawing = await this.store.findDrawing(
      viewer.workspaceId,
      projectId,
      drawingId,
    );
    if (drawing == null) throw drawingNotFound();
    return drawing;
  }

  private async namesOf(
    workspaceId: string,
    revisions: readonly DrawingRevision[],
  ): Promise<Map<string, string>> {
    return this.names.namesOf(workspaceId, [
      ...new Set(revisions.map((revision) => revision.createdBy)),
    ]);
  }

  private audit(
    workspaceId: string,
    by: string,
    action: string,
    entity: { type: string; id: string },
    now: Date,
    extra: Partial<AuditEvent> = {},
  ): AuditEvent {
    return {
      workspaceId,
      actorUserId: by,
      action,
      entityType: entity.type,
      entityId: entity.id,
      occurredAt: now,
      ...extra,
    };
  }

  private async detail(
    workspaceId: string,
    drawing: DrawingWithRevisions,
  ): Promise<DrawingDetailView> {
    const album = await this.store.findAlbum(
      workspaceId,
      drawing.projectId,
      drawing.albumId,
    );
    const names = await this.namesOf(workspaceId, drawing.revisions);
    return {
      ...drawing,
      albumName: album?.name ?? "",
      revisions: drawing.revisions.map((revision) =>
        revisionView(revision, names),
      ),
    };
  }

  // Albums.

  /** The Project's albums by name, with their drawing counts. */
  async albums(
    viewer: ProjectViewer,
    projectId: string,
  ): Promise<AlbumWithCount[]> {
    await this.visible(viewer, projectId);
    return this.store.listAlbums(viewer.workspaceId, projectId);
  }

  /** 409 `ALBUM_NAME_IN_USE` for a name already in the Project. */
  async addAlbum(input: {
    viewer: ProjectViewer;
    projectId: string;
    name: string;
    by: string;
  }): Promise<AlbumWithCount> {
    await this.visible(input.viewer, input.projectId);
    const now = this.clock();
    const album: DrawingAlbum = {
      id: newId(now.getTime()),
      workspaceId: input.viewer.workspaceId,
      projectId: input.projectId,
      name: albumName(input.name),
      isSeed: false,
      createdAt: now,
      updatedAt: now,
    };
    await this.store.insertAlbum(
      album,
      input.by,
      this.audit(
        album.workspaceId,
        input.by,
        "drawing_album.created",
        { type: "drawing_album", id: album.id },
        now,
        { after: { projectId: album.projectId, name: album.name } },
      ),
    );
    return { ...album, drawingCount: 0 };
  }

  /** 409 `ALBUM_CHANGED` when someone saved in between, `ALBUM_NAME_IN_USE`. */
  async renameAlbum(input: {
    viewer: ProjectViewer;
    projectId: string;
    albumId: string;
    name: string;
    expectedUpdatedAt: Date;
    by: string;
  }): Promise<DrawingAlbum> {
    const album = await this.liveAlbum(
      input.viewer,
      input.projectId,
      input.albumId,
    );
    const name = albumName(input.name);
    const now = this.clock();
    return this.store.renameAlbum({
      album,
      name,
      expectedUpdatedAt: input.expectedUpdatedAt,
      by: input.by,
      now,
      audit: this.audit(
        album.workspaceId,
        input.by,
        "drawing_album.renamed",
        { type: "drawing_album", id: album.id },
        now,
        { before: { name: album.name }, after: { name } },
      ),
    });
  }

  /** 409 `ALBUM_NOT_EMPTY` while it holds drawings (ADR CM-0013 §8). */
  async deleteAlbum(input: {
    viewer: ProjectViewer;
    projectId: string;
    albumId: string;
    by: string;
  }): Promise<void> {
    const album = await this.liveAlbum(
      input.viewer,
      input.projectId,
      input.albumId,
    );
    const now = this.clock();
    await this.store.deleteAlbum({
      album,
      by: input.by,
      now,
      audit: this.audit(
        album.workspaceId,
        input.by,
        "drawing_album.deleted",
        { type: "drawing_album", id: album.id },
        now,
        { before: { projectId: album.projectId, name: album.name } },
      ),
    });
  }

  /** An album and its drawings, each with its latest revision. */
  async album(
    viewer: ProjectViewer,
    projectId: string,
    albumId: string,
  ): Promise<{ album: DrawingAlbum; drawings: DrawingView[] }> {
    const album = await this.liveAlbum(viewer, projectId, albumId);
    const drawings = await this.store.listDrawings(
      viewer.workspaceId,
      projectId,
      albumId,
    );
    const names = await this.namesOf(
      viewer.workspaceId,
      drawings.map((drawing) => drawing.latest),
    );
    return {
      album,
      drawings: drawings.map((drawing) => ({
        ...drawing,
        latest: revisionView(drawing.latest, names),
      })),
    };
  }

  // Drawings.

  /** A drawing with its revision history, newest first. */
  async drawing(
    viewer: ProjectViewer,
    projectId: string,
    drawingId: string,
  ): Promise<DrawingDetailView> {
    const drawing = await this.liveDrawing(viewer, projectId, drawingId);
    return this.detail(viewer.workspaceId, drawing);
  }

  /** Step 1 of uploading a drawing or a revision (CM-407). */
  async start(input: {
    viewer: ProjectViewer;
    projectId: string;
    fileName: string;
    bytes: number;
  }): Promise<StartedUpload> {
    await this.visible(input.viewer, input.projectId);
    return this.uploads.start(this.target(input.viewer, input.projectId), {
      fileName: input.fileName,
      bytes: input.bytes,
    });
  }

  async answerDirectUpload(input: {
    viewer: ProjectViewer;
    projectId: string;
    request: Request;
    body: unknown;
  }): Promise<unknown> {
    const { viewer, projectId } = input;
    return this.uploads.answerDirectUpload(this.target(viewer, projectId), {
      request: input.request,
      body: input.body,
      authorize: () => this.visible(viewer, projectId),
    });
  }

  async receive(input: {
    viewer: ProjectViewer;
    projectId: string;
    key: string;
    bytes: Uint8Array;
  }): Promise<void> {
    if (this.uploads.takesDirectUploads())
      throw notFound("NOT_FOUND", "Uploads go straight to storage here.");
    await this.visible(input.viewer, input.projectId);
    await this.uploads.receive(this.target(input.viewer, input.projectId), {
      key: input.key,
      bytes: input.bytes,
    });
  }

  async receiveThumbnail(input: {
    viewer: ProjectViewer;
    projectId: string;
    key: string;
    bytes: Uint8Array;
  }): Promise<void> {
    await this.visible(input.viewer, input.projectId);
    await this.uploads.receiveThumbnail(
      this.target(input.viewer, input.projectId),
      { key: input.key, bytes: input.bytes },
    );
  }

  /** What the owner already has for a key, for an idempotent completion. */
  private recordedAt(
    viewer: ProjectViewer,
    projectId: string,
    key: string,
  ): () => Promise<
    { state: "live"; value: RevisionAtKey } | { state: "deleted" } | null
  > {
    return async () => {
      const found = await this.store.findRevisionByKey(
        viewer.workspaceId,
        projectId,
        key,
      );
      if (found == null) return null;
      return found.deleted
        ? { state: "deleted" }
        : { state: "live", value: found };
    };
  }

  private files(
    upload: CheckedUpload,
    workspaceId: string,
    by: string,
    now: Date,
  ): NewStoredFile[] {
    return storedFilesOf(upload, {
      workspaceId,
      kind: DRAWING_FILE_KIND,
      by,
      now,
    });
  }

  private revisionSummary(drawing: Drawing, revision: DrawingRevision) {
    return {
      projectId: drawing.projectId,
      albumId: drawing.albumId,
      name: drawing.name,
      revision: revision.revision,
      fileName: revision.fileName,
      bytes: revision.bytes,
    };
  }

  /**
   * Step 3 for a new drawing: records the file at `key` as its R1 in
   * `albumId`. The name defaults to the file name without its extension.
   * A retry returns the drawing already recorded (`created` false).
   */
  async addDrawing(input: {
    viewer: ProjectViewer;
    projectId: string;
    albumId: string;
    key: string;
    fileName: string;
    name?: string | null;
    by: string;
  }): Promise<{ drawing: DrawingDetailView; created: boolean }> {
    const { viewer, projectId } = input;
    const { workspaceId } = viewer;
    await this.liveAlbum(viewer, projectId, input.albumId);
    const typed = input.name?.trim() ?? "";
    const chosenName = typed.length === 0 ? null : drawingName(typed);
    const { value, created } = await this.uploads.complete<RevisionAtKey>(
      this.target(viewer, projectId),
      {
        key: input.key,
        fileName: input.fileName,
        recorded: this.recordedAt(viewer, projectId, input.key),
        record: async (upload) => {
          const now = this.clock();
          const drawing: Drawing = {
            id: newId(now.getTime()),
            workspaceId,
            projectId,
            albumId: input.albumId,
            name: chosenName ?? drawingNameFromFile(upload.fileName),
            createdAt: now,
            updatedAt: now,
            createdBy: input.by,
          };
          const revision: DrawingRevision = {
            id: newId(now.getTime()),
            workspaceId,
            drawingId: drawing.id,
            revision: 1,
            fileKey: upload.key,
            fileName: upload.fileName,
            contentType: upload.contentType,
            bytes: upload.bytes,
            thumbKey: upload.thumbnail?.key ?? null,
            createdAt: now,
            createdBy: input.by,
          };
          const result = await this.store.addDrawing({
            drawing,
            revision,
            files: this.files(upload, workspaceId, input.by, now),
            audit: this.audit(
              workspaceId,
              input.by,
              "drawing.created",
              { type: "drawing", id: drawing.id },
              now,
              { after: this.revisionSummary(drawing, revision) },
            ),
          });
          return result === "duplicate"
            ? "duplicate"
            : { drawing, revision, deleted: false };
        },
      },
    );
    const stored = await this.liveDrawing(viewer, projectId, value.drawing.id);
    return { drawing: await this.detail(workspaceId, stored), created };
  }

  /** Step 3 for "Upload new revision": the next R number of the drawing. */
  async addRevision(input: {
    viewer: ProjectViewer;
    projectId: string;
    drawingId: string;
    key: string;
    fileName: string;
    by: string;
  }): Promise<{ drawing: DrawingDetailView; created: boolean }> {
    const { viewer, projectId } = input;
    const { workspaceId } = viewer;
    const drawing = await this.liveDrawing(viewer, projectId, input.drawingId);
    const { value, created } = await this.uploads.complete<RevisionAtKey>(
      this.target(viewer, projectId),
      {
        key: input.key,
        fileName: input.fileName,
        recorded: this.recordedAt(viewer, projectId, input.key),
        record: async (upload) => {
          const now = this.clock();
          const result = await this.store.addRevision({
            revision: {
              id: newId(now.getTime()),
              workspaceId,
              drawingId: drawing.id,
              fileKey: upload.key,
              fileName: upload.fileName,
              contentType: upload.contentType,
              bytes: upload.bytes,
              thumbKey: upload.thumbnail?.key ?? null,
              createdAt: now,
              createdBy: input.by,
            },
            files: this.files(upload, workspaceId, input.by, now),
            audit: (number) =>
              this.audit(
                workspaceId,
                input.by,
                "drawing.revision_added",
                { type: "drawing", id: drawing.id },
                now,
                {
                  after: {
                    projectId,
                    revision: number,
                    fileName: upload.fileName,
                    bytes: upload.bytes,
                  },
                },
              ),
          });
          return result === "duplicate"
            ? "duplicate"
            : { drawing, revision: result, deleted: false };
        },
      },
    );
    if (value.drawing.id !== drawing.id) throw drawingNotFound();
    const stored = await this.liveDrawing(viewer, projectId, drawing.id);
    return { drawing: await this.detail(workspaceId, stored), created };
  }

  /**
   * Renames a drawing and / or moves it to another album of the Project.
   * 409 `DRAWING_CHANGED` when someone saved in between.
   */
  async updateDrawing(input: {
    viewer: ProjectViewer;
    projectId: string;
    drawingId: string;
    name?: string;
    albumId?: string;
    expectedUpdatedAt: Date;
    by: string;
  }): Promise<DrawingDetailView> {
    const { viewer, projectId } = input;
    const drawing = await this.liveDrawing(viewer, projectId, input.drawingId);
    const name = input.name == null ? drawing.name : drawingName(input.name);
    const albumId = input.albumId ?? drawing.albumId;
    if (albumId !== drawing.albumId)
      await this.liveAlbum(viewer, projectId, albumId);
    const now = this.clock();
    const action =
      albumId !== drawing.albumId ? "drawing.moved" : "drawing.renamed";
    await this.store.updateDrawing({
      drawing,
      name,
      albumId,
      expectedUpdatedAt: input.expectedUpdatedAt,
      by: input.by,
      now,
      audit: this.audit(
        viewer.workspaceId,
        input.by,
        action,
        { type: "drawing", id: drawing.id },
        now,
        {
          before: { name: drawing.name, albumId: drawing.albumId },
          after: { name, albumId },
        },
      ),
    });
    const stored = await this.liveDrawing(viewer, projectId, drawing.id);
    return this.detail(viewer.workspaceId, stored);
  }

  /** Tombstones the drawing and every revision; then their files go. */
  async deleteDrawing(input: {
    viewer: ProjectViewer;
    projectId: string;
    drawingId: string;
    by: string;
  }): Promise<void> {
    const drawing = await this.liveDrawing(
      input.viewer,
      input.projectId,
      input.drawingId,
    );
    const now = this.clock();
    const removed = await this.store.deleteDrawing({
      drawing,
      by: input.by,
      now,
      audit: this.audit(
        input.viewer.workspaceId,
        input.by,
        "drawing.deleted",
        { type: "drawing", id: drawing.id },
        now,
        {
          before: {
            projectId: drawing.projectId,
            albumId: drawing.albumId,
            name: drawing.name,
            revisions: drawing.revisions.length,
          },
        },
      ),
    });
    if (!removed) throw drawingNotFound();
    await this.uploads.discard(
      ...drawing.revisions.flatMap((revision) =>
        revision.thumbKey == null
          ? [revision.fileKey]
          : [revision.fileKey, revision.thumbKey],
      ),
    );
  }

  private async revisionOf(
    viewer: ProjectViewer,
    projectId: string,
    drawingId: string,
    revisionId: string,
  ): Promise<DrawingRevision> {
    const drawing = await this.liveDrawing(viewer, projectId, drawingId);
    const revision = drawing.revisions.find((item) => item.id === revisionId);
    if (revision == null)
      throw notFound("REVISION_NOT_FOUND", "This revision was not found.");
    return revision;
  }

  /** One revision's file, to show or download. */
  async readRevision(
    viewer: ProjectViewer,
    projectId: string,
    drawingId: string,
    revisionId: string,
  ): Promise<{ revision: DrawingRevisionView; object: StoredObject }> {
    const revision = await this.revisionOf(
      viewer,
      projectId,
      drawingId,
      revisionId,
    );
    const object = await this.uploads.read(revision.fileKey);
    if (object == null)
      throw notFound("REVISION_NOT_FOUND", "This revision was not found.");
    return { revision: revisionView(revision, new Map()), object };
  }

  /** A revision's WebP thumbnail; 404 `THUMBNAIL_NOT_FOUND` without one. */
  async readRevisionThumbnail(
    viewer: ProjectViewer,
    projectId: string,
    drawingId: string,
    revisionId: string,
  ): Promise<StoredObject> {
    const revision = await this.revisionOf(
      viewer,
      projectId,
      drawingId,
      revisionId,
    );
    const object =
      revision.thumbKey == null
        ? null
        : await this.uploads.read(revision.thumbKey);
    if (object == null) throw thumbnailNotFound();
    return object;
  }
}
