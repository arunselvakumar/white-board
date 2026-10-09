import type { AuditEvent } from "@/src/shared-kernel/audit";
import {
  DomainError,
  conflict,
  notFound,
} from "@/src/shared-kernel/domain-error";
import {
  cleanFileName,
  fileTooLarge,
  firstBytes,
  isProgram,
  type NewStoredFile,
  type ObjectStorage,
  type StoredObject,
} from "@/src/shared-kernel/files";
import { sniffDocumentType } from "@/src/shared-kernel/files/document-file";
import { newId } from "@/src/shared-kernel/ids";
import type { PlanGate } from "@/src/shared-kernel/plan";

import {
  isBlockedDocumentName,
  isProjectDocumentKey,
  programNotAllowed,
  projectDocumentKey,
  uploadKeyInvalid,
  type ProjectDocument,
} from "../domain/project-document";
import {
  PROJECT_DOCUMENT_MAX_BYTES,
  PROJECT_DOCUMENT_MULTIPART_FROM_BYTES,
  PROJECT_DOCUMENTS_MAX,
  type ProjectDocumentKind,
} from "../domain/project-document-rules";
import type { ProjectRepository } from "../domain/project-repository";
import type { ProjectViewer } from "./project-handlers";

/** `stored_files.kind` of a Project document. */
export const PROJECT_DOCUMENT_FILE_KIND = "project_document";

/** `storage_gb` is counted in GiB, like the organization context's meter. */
const BYTES_PER_GB = 1024 ** 3;

/** Enough of the file to tell a program, a PDF or an image. */
const SNIFF_BYTES = 64;

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
   * Inserts the document with its `stored_files` row and audit event while
   * holding the Project: 404 `PROJECT_NOT_FOUND` once it is gone, 409
   * `DOCUMENTS_LIMIT` at `maxDocuments` live files. `duplicate` when a row
   * already has this key (a retried completion won the race).
   */
  add(input: {
    document: ProjectDocument;
    file: NewStoredFile;
    audit: AuditEvent;
    maxDocuments: number;
  }): Promise<"added" | "duplicate">;
  /** Tombstones the document; false when it was already gone. */
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

/** How the browser sends the bytes after `start`. */
export type UploadRoute = { via: "blob"; multipart: boolean } | { via: "app" };

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

const projectNotFound = () =>
  notFound("PROJECT_NOT_FOUND", "This Project was not found.");

function documentsLimit(): DomainError {
  return conflict(
    "DOCUMENTS_LIMIT",
    `Keep at most ${String(PROJECT_DOCUMENTS_MAX)} documents on a Project. Delete one first.`,
  );
}

function uploadNotFound(): DomainError {
  return new DomainError(
    "UPLOAD_NOT_FOUND",
    "The file did not finish uploading. Try again.",
  );
}

/**
 * Files kept on a Project (CM-414): tender papers, quotations, the LOA,
 * the client's PO / WO, the agreement. Any type but programs, at most 25 MB
 * each and 50 per Project, counted towards the Company's storage.
 *
 * The bytes never pass through a deployed function (4.5 MB body limit):
 * `start` checks the name, size, count and plan and names the key; the
 * browser sends the file straight to storage (`answerDirectUpload`), or
 * through `receive` where storage is files on disk; `complete` then checks
 * what actually arrived (size, not a program by content) and records it
 * with its `stored_files` row in one transaction. A refused or failed
 * completion deletes the object it was about.
 *
 * Who may see a Project may see its documents; routes check the Permission
 * Matrix (`projects.project` read / update) first.
 */
export class ProjectDocuments {
  constructor(
    private readonly projects: Pick<ProjectRepository, "findById">,
    private readonly store: ProjectDocumentStore,
    private readonly storage: ObjectStorage,
    private readonly plan: PlanGate,
    private readonly names: UploaderNames,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** The Owner sees every Project, a Member only those assigned to them. */
  private async project(viewer: ProjectViewer, id: string): Promise<void> {
    const visible = viewer.role === "owner" || viewer.projectIds.has(id);
    const found = visible
      ? await this.projects.findById(viewer.workspaceId, id)
      : null;
    if (found == null) throw projectNotFound();
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

  /** Best effort: a leftover object costs storage, not correctness. */
  private async discard(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch (error) {
      console.error(`Could not delete ${key} from storage`, error);
    }
  }

  /** Never delete an object a document row points at. */
  private async discardUnlessRecorded(
    workspaceId: string,
    projectId: string,
    key: string,
  ): Promise<void> {
    const recorded = await this.store
      .findByKey(workspaceId, projectId, key)
      .catch(() => "unknown" as const);
    if (recorded == null) await this.discard(key);
  }

  private async assertRoomFor(
    workspaceId: string,
    projectId: string,
    bytes: number,
  ): Promise<void> {
    if (
      (await this.store.count(workspaceId, projectId)) >= PROJECT_DOCUMENTS_MAX
    )
      throw documentsLimit();
    await this.plan.assertCanAdd(
      workspaceId,
      "storage_gb",
      bytes / BYTES_PER_GB,
    );
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
  }): Promise<{ key: string; fileName: string; upload: UploadRoute }> {
    const { workspaceId } = input.viewer;
    await this.project(input.viewer, input.projectId);
    const fileName = cleanFileName(input.fileName, "bin");
    if (isBlockedDocumentName(fileName)) throw programNotAllowed();
    if (input.bytes > PROJECT_DOCUMENT_MAX_BYTES)
      throw fileTooLarge(PROJECT_DOCUMENT_MAX_BYTES);
    await this.assertRoomFor(workspaceId, input.projectId, input.bytes);
    const key = projectDocumentKey(
      workspaceId,
      input.projectId,
      fileName,
      this.clock(),
    );
    const upload: UploadRoute =
      this.storage.directUploads == null
        ? { via: "app" }
        : {
            via: "blob",
            multipart: input.bytes >= PROJECT_DOCUMENT_MULTIPART_FROM_BYTES,
          };
    return { key, fileName, upload };
  }

  /** Whether this viewer may write `key` now; the size limit if so. */
  private async allowUpload(
    viewer: ProjectViewer,
    projectId: string,
    key: string,
  ): Promise<{ maxBytes: number }> {
    await this.project(viewer, projectId);
    if (!isProjectDocumentKey(key, viewer.workspaceId, projectId))
      throw uploadKeyInvalid();
    return { maxBytes: PROJECT_DOCUMENT_MAX_BYTES };
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
    const direct = this.storage.directUploads;
    if (direct == null)
      throw notFound("NOT_FOUND", "Uploads go through the app on this server.");
    return direct.answer({
      request: input.request,
      body: input.body,
      allow: (key) => this.allowUpload(input.viewer, input.projectId, key),
    });
  }

  /**
   * Step 2, development and tests: the bytes through our route, where
   * storage is files on disk. 404 where browsers upload straight to
   * storage; 409 `UPLOAD_EXISTS` rather than replace an object, as Blob
   * refuses to overwrite.
   */
  async receive(input: {
    viewer: ProjectViewer;
    projectId: string;
    key: string;
    bytes: Uint8Array;
  }): Promise<void> {
    if (this.storage.directUploads != null)
      throw notFound("NOT_FOUND", "Uploads go straight to storage here.");
    await this.allowUpload(input.viewer, input.projectId, input.key);
    if ((await this.storage.head(input.key)) != null)
      throw conflict("UPLOAD_EXISTS", "This upload was already sent.");
    await this.storage.put(input.key, input.bytes, "application/octet-stream");
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
    const { workspaceId } = input.viewer;
    const { projectId, key } = input;
    await this.project(input.viewer, projectId);
    if (!isProjectDocumentKey(key, workspaceId, projectId))
      throw uploadKeyInvalid();

    const existing = await this.store.findByKey(workspaceId, projectId, key);
    if (existing != null) {
      // Deleted already: whatever was sent there again is not kept.
      if (existing.deletedAt != null) {
        await this.discard(key);
        throw uploadNotFound();
      }
      return { document: await this.view(existing), created: false };
    }

    const head = await this.storage.head(key);
    if (head == null) throw uploadNotFound();
    try {
      const fileName = cleanFileName(input.fileName, "bin");
      if (isBlockedDocumentName(fileName)) throw programNotAllowed();
      if (head.bytes === 0)
        throw new DomainError("FILE_EMPTY", "Choose a file to upload.");
      if (head.bytes > PROJECT_DOCUMENT_MAX_BYTES)
        throw fileTooLarge(PROJECT_DOCUMENT_MAX_BYTES);
      const object = await this.storage.get(key);
      if (object == null) throw uploadNotFound();
      const prefix = await firstBytes(object, SNIFF_BYTES);
      if (isProgram(prefix)) throw programNotAllowed();
      await this.plan.assertCanAdd(
        workspaceId,
        "storage_gb",
        head.bytes / BYTES_PER_GB,
      );

      const now = this.clock();
      const document: ProjectDocument = {
        id: newId(now.getTime()),
        workspaceId,
        projectId,
        kind: input.kind,
        fileKey: key,
        fileName,
        contentType: sniffDocumentType(prefix) ?? "application/octet-stream",
        bytes: head.bytes,
        createdAt: now,
        createdBy: input.by,
      };
      const result = await this.store.add({
        document,
        file: {
          workspaceId,
          key,
          kind: PROJECT_DOCUMENT_FILE_KIND,
          contentType: document.contentType,
          bytes: document.bytes,
          createdBy: input.by,
          createdAt: now,
        },
        audit: this.audit(document, input.by, "document_added", now, {
          after: this.summary(document),
        }),
        maxDocuments: PROJECT_DOCUMENTS_MAX,
      });
      if (result === "duplicate") {
        const winner = await this.store.findByKey(workspaceId, projectId, key);
        if (winner == null || winner.deletedAt != null) throw uploadNotFound();
        return { document: await this.view(winner), created: false };
      }
      return { document: await this.view(document), created: true };
    } catch (error) {
      await this.discardUnlessRecorded(workspaceId, projectId, key);
      throw error;
    }
  }

  /** Newest first, with the bytes they take. */
  async list(
    viewer: ProjectViewer,
    projectId: string,
  ): Promise<{ items: ProjectDocumentView[]; totalBytes: number }> {
    await this.project(viewer, projectId);
    const documents = await this.store.list(viewer.workspaceId, projectId);
    return {
      items: await this.views(viewer.workspaceId, documents),
      totalBytes: documents.reduce((sum, item) => sum + item.bytes, 0),
    };
  }

  async read(
    viewer: ProjectViewer,
    projectId: string,
    documentId: string,
  ): Promise<{ document: ProjectDocumentView; object: StoredObject }> {
    await this.project(viewer, projectId);
    const found = await this.store.find(
      viewer.workspaceId,
      projectId,
      documentId,
    );
    if (found == null) throw projectDocumentNotFound();
    const object = await this.storage.get(found.fileKey);
    if (object == null) throw projectDocumentNotFound();
    return { document: toView(found, new Map()), object };
  }

  /** Tombstone, then the object goes (best effort). */
  async delete(input: {
    viewer: ProjectViewer;
    projectId: string;
    documentId: string;
    by: string;
  }): Promise<void> {
    await this.project(input.viewer, input.projectId);
    const document = await this.store.find(
      input.viewer.workspaceId,
      input.projectId,
      input.documentId,
    );
    if (document == null) throw projectDocumentNotFound();
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
    await this.discard(document.fileKey);
  }
}
