import {
  AttachmentUploads,
  storedFilesOf,
  type StartedUpload,
  type UploadTarget,
} from "@/src/shared-kernel/attachments";
import type { AuditEvent } from "@/src/shared-kernel/audit";
import {
  type DomainError,
  conflict,
  notFound,
} from "@/src/shared-kernel/domain-error";
import type {
  NewStoredFile,
  ObjectStorage,
  StoredObject,
} from "@/src/shared-kernel/files";
import { newId } from "@/src/shared-kernel/ids";
import type { PlanGate } from "@/src/shared-kernel/plan";

import type { ProjectDocument } from "../domain/project-document";
import {
  PROJECT_DOCUMENTS_MAX,
  type ProjectDocumentKind,
} from "../domain/project-document-rules";
import type { ProjectRepository } from "../domain/project-repository";
import { PROJECT_DOCUMENT_POLICY } from "../domain/project-upload-policies";
import type { ProjectViewer } from "./project-handlers";
import { assertProjectVisible } from "./project-visibility";

export type { UploadRoute } from "@/src/shared-kernel/attachments";

/** `stored_files.kind` of a Project document. */
export const PROJECT_DOCUMENT_FILE_KIND = "project_document";

/** A stored document, `null` once it was deleted (its key stays taken). */
export type StoredProjectDocument = ProjectDocument & {
  deletedAt: Date | null;
};

/** The rows behind a Project's documents; each write is one transaction. */
export type ProjectDocumentStore = {
  /** Live documents, newest first. */
  list(workspaceId: string, projectId: string): Promise<ProjectDocument[]>;
  count(workspaceId: string, projectId: string): Promise<number>;
  /** A live document, or null. */
  find(
    workspaceId: string,
    projectId: string,
    id: string,
  ): Promise<ProjectDocument | null>;
  /** The document at this key, live or deleted, or null. */
  findByKey(
    workspaceId: string,
    projectId: string,
    key: string,
  ): Promise<StoredProjectDocument | null>;
  /**
   * Inserts the document with its `stored_files` rows (the file, and the
   * thumbnail when there is one), its Gallery row when it is a PDF or an
   * image, and its audit event while holding the Project: 404
   * `PROJECT_NOT_FOUND` once it is gone, 409 `DOCUMENTS_LIMIT` at
   * `maxDocuments` live files. `duplicate` when a row already has this key
   * (a retried completion won the race).
   */
  add(input: {
    document: ProjectDocument;
    file: NewStoredFile;
    thumbnail?: NewStoredFile;
    audit: AuditEvent;
    maxDocuments: number;
  }): Promise<"added" | "duplicate">;
  /** Tombstones the document and its Gallery row; false when it was already gone. */
  remove(input: {
    document: ProjectDocument;
    by: string;
    now: Date;
    audit: AuditEvent;
  }): Promise<boolean>;
};

/** Names of the Team Members behind User ids (the organization context's). */
export type UploaderNames = {
  namesOf(
    workspaceId: string,
    userIds: readonly string[],
  ): Promise<Map<string, string>>;
};

export type ProjectDocumentView = ProjectDocument & {
  /** A PDF or an image, which the browser can show. */
  viewable: boolean;
  createdByName: string | null;
};

const VIEWABLE = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

function toView(
  document: ProjectDocument,
  names: ReadonlyMap<string, string>,
): ProjectDocumentView {
  return {
    ...document,
    viewable: VIEWABLE.has(document.contentType),
    createdByName: names.get(document.createdBy) ?? null,
  };
}

export const projectDocumentNotFound = () =>
  notFound("DOCUMENT_NOT_FOUND", "This document was not found.");

function documentsLimit(): DomainError {
  return conflict(
    "DOCUMENTS_LIMIT",
    `Keep at most ${String(PROJECT_DOCUMENTS_MAX)} documents on a Project. Delete one first.`,
  );
}

/**
 * Files kept on a Project (CM-414): tender papers, quotations, the LOA,
 * the client's PO / WO, the agreement. Any type but programs, at most 25 MB
 * each and 50 per Project, counted towards the Company's storage.
 *
 * Uploads run through the kernel's attachments service (CM-407, policy
 * `PROJECT_DOCUMENT_POLICY`): `start`, the bytes straight to storage or
 * through `receive`, an image's thumbnail through `receiveThumbnail`, then
 * `complete`, which records the document with its `stored_files` rows and
 * its Gallery row in one transaction.
 *
 * Who may see a Project may see its documents; routes check the Permission
 * Matrix (`projects.project` read / update) first.
 */
export class ProjectDocuments {
  private readonly uploads: AttachmentUploads;

  constructor(
    private readonly projects: Pick<ProjectRepository, "findById">,
    private readonly store: ProjectDocumentStore,
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
      policy: PROJECT_DOCUMENT_POLICY,
    };
  }

  private audit(
    document: ProjectDocument,
    by: string,
    action: string,
    now: Date,
    extra: Partial<AuditEvent>,
  ): AuditEvent {
    return {
      workspaceId: document.workspaceId,
      actorUserId: by,
      action: `project.${action}`,
      entityType: "project",
      entityId: document.projectId,
      occurredAt: now,
      ...extra,
    };
  }

  private summary(document: ProjectDocument) {
    return {
      documentId: document.id,
      kind: document.kind,
      fileName: document.fileName,
      bytes: document.bytes,
    };
  }

  private async views(
    workspaceId: string,
    documents: ProjectDocument[],
  ): Promise<ProjectDocumentView[]> {
    const names = await this.names.namesOf(workspaceId, [
      ...new Set(documents.map((document) => document.createdBy)),
    ]);
    return documents.map((document) => toView(document, names));
  }

  private async view(document: ProjectDocument): Promise<ProjectDocumentView> {
    const names = await this.names.namesOf(document.workspaceId, [
      document.createdBy,
    ]);
    return toView(document, names);
  }

  /**
   * Step 1: before any byte moves. 400 `FILE_TYPE_NOT_ALLOWED` for a
   * program's name, 400 `FILE_TOO_LARGE` above 25 MB, 409
   * `DOCUMENTS_LIMIT` at 50 files, 402 past the plan's storage.
   */
  async start(input: {
    viewer: ProjectViewer;
    projectId: string;
    fileName: string;
    bytes: number;
  }): Promise<StartedUpload> {
    const { viewer, projectId } = input;
    await assertProjectVisible(this.projects, viewer, projectId);
    return this.uploads.start(this.target(viewer, projectId), {
      fileName: input.fileName,
      bytes: input.bytes,
      check: async () => {
        if (
          (await this.store.count(viewer.workspaceId, projectId)) >=
          PROJECT_DOCUMENTS_MAX
        )
          throw documentsLimit();
      },
    });
  }

  /**
   * Step 2, deployed: the browser's `uploadPresigned()` handshake. 404
   * where storage takes no direct uploads (files on disk).
   */
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
      authorize: () => assertProjectVisible(this.projects, viewer, projectId),
    });
  }

  /**
   * Step 2, development and tests: the bytes through our route, where
   * storage is files on disk. 404 where browsers upload straight to
   * storage; 409 `UPLOAD_EXISTS` rather than replace an object.
   */
  async receive(input: {
    viewer: ProjectViewer;
    projectId: string;
    key: string;
    bytes: Uint8Array;
  }): Promise<void> {
    const { viewer, projectId } = input;
    if (this.uploads.takesDirectUploads())
      throw notFound("NOT_FOUND", "Uploads go straight to storage here.");
    await assertProjectVisible(this.projects, viewer, projectId);
    await this.uploads.receive(this.target(viewer, projectId), {
      key: input.key,
      bytes: input.bytes,
    });
  }

  /** An image's browser-made WebP thumbnail, sent before completing (CM-407). */
  async receiveThumbnail(input: {
    viewer: ProjectViewer;
    projectId: string;
    key: string;
    bytes: Uint8Array;
  }): Promise<void> {
    const { viewer, projectId } = input;
    await assertProjectVisible(this.projects, viewer, projectId);
    await this.uploads.receiveThumbnail(this.target(viewer, projectId), {
      key: input.key,
      bytes: input.bytes,
    });
  }

  /**
   * Step 3: records what arrived at `key`. A retry for a key already
   * recorded returns that document (`created` false). 400
   * `UPLOAD_NOT_FOUND`, `FILE_EMPTY`, `FILE_TOO_LARGE` or
   * `FILE_TYPE_NOT_ALLOWED` (a program by content); 409 / 402 as `start`.
   */
  async complete(input: {
    viewer: ProjectViewer;
    projectId: string;
    key: string;
    kind: ProjectDocumentKind;
    fileName: string;
    by: string;
  }): Promise<{ document: ProjectDocumentView; created: boolean }> {
    const { viewer, projectId, key } = input;
    const { workspaceId } = viewer;
    await assertProjectVisible(this.projects, viewer, projectId);
    const { value, created } = await this.uploads.complete<ProjectDocument>(
      this.target(viewer, projectId),
      {
        key,
        fileName: input.fileName,
        recorded: async () => {
          const found = await this.store.findByKey(workspaceId, projectId, key);
          if (found == null) return null;
          return found.deletedAt == null
            ? { state: "live", value: found }
            : { state: "deleted" };
        },
        record: async (upload) => {
          const now = this.clock();
          const document: ProjectDocument = {
            id: newId(now.getTime()),
            workspaceId,
            projectId,
            kind: input.kind,
            fileKey: key,
            fileName: upload.fileName,
            contentType: upload.contentType,
            bytes: upload.bytes,
            thumbKey: upload.thumbnail?.key ?? null,
            createdAt: now,
            createdBy: input.by,
          };
          const [file, thumbnail] = storedFilesOf(upload, {
            workspaceId,
            kind: PROJECT_DOCUMENT_FILE_KIND,
            by: input.by,
            now,
          });
          if (file == null) throw new Error("An upload has a stored file.");
          const result = await this.store.add({
            document,
            file,
            ...(thumbnail == null ? {} : { thumbnail }),
            audit: this.audit(document, input.by, "document_added", now, {
              after: this.summary(document),
            }),
            maxDocuments: PROJECT_DOCUMENTS_MAX,
          });
          return result === "duplicate" ? "duplicate" : document;
        },
      },
    );
    return { document: await this.view(value), created };
  }

  /** Newest first, with the bytes they take. */
  async list(
    viewer: ProjectViewer,
    projectId: string,
  ): Promise<{ items: ProjectDocumentView[]; totalBytes: number }> {
    await assertProjectVisible(this.projects, viewer, projectId);
    const documents = await this.store.list(viewer.workspaceId, projectId);
    return {
      items: await this.views(viewer.workspaceId, documents),
      totalBytes: documents.reduce((sum, item) => sum + item.bytes, 0),
    };
  }

  private async live(
    viewer: ProjectViewer,
    projectId: string,
    documentId: string,
  ): Promise<ProjectDocument> {
    await assertProjectVisible(this.projects, viewer, projectId);
    const found = await this.store.find(
      viewer.workspaceId,
      projectId,
      documentId,
    );
    if (found == null) throw projectDocumentNotFound();
    return found;
  }

  async read(
    viewer: ProjectViewer,
    projectId: string,
    documentId: string,
  ): Promise<{ document: ProjectDocumentView; object: StoredObject }> {
    const found = await this.live(viewer, projectId, documentId);
    const object = await this.uploads.read(found.fileKey);
    if (object == null) throw projectDocumentNotFound();
    return { document: toView(found, new Map()), object };
  }

  /** The document's thumbnail; 404 `THUMBNAIL_NOT_FOUND` when it has none. */
  async readThumbnail(
    viewer: ProjectViewer,
    projectId: string,
    documentId: string,
  ): Promise<StoredObject> {
    const found = await this.live(viewer, projectId, documentId);
    const object =
      found.thumbKey == null ? null : await this.uploads.read(found.thumbKey);
    if (object == null) throw thumbnailNotFound();
    return object;
  }

  /** Tombstone, then the object and its thumbnail go (best effort). */
  async delete(input: {
    viewer: ProjectViewer;
    projectId: string;
    documentId: string;
    by: string;
  }): Promise<void> {
    const document = await this.live(
      input.viewer,
      input.projectId,
      input.documentId,
    );
    const now = this.clock();
    const removed = await this.store.remove({
      document,
      by: input.by,
      now,
      audit: this.audit(document, input.by, "document_deleted", now, {
        before: this.summary(document),
      }),
    });
    if (!removed) throw projectDocumentNotFound();
    await this.uploads.discard(
      document.fileKey,
      ...(document.thumbKey == null ? [] : [document.thumbKey]),
    );
  }
}

export const thumbnailNotFound = () =>
  notFound("THUMBNAIL_NOT_FOUND", "This file has no thumbnail.");
