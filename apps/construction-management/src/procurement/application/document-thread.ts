import type { MemberAccess } from "@/src/shared-kernel/access";
import { APPROVAL_LIMITS, requiredText } from "@/src/shared-kernel/approval";
import {
  AttachmentUploads,
  storedFilesOf,
  type StartedUpload,
  type UploadTarget,
} from "@/src/shared-kernel/attachments";
import type { AuditEvent } from "@/src/shared-kernel/audit";
import {
  DomainError,
  conflict,
  forbidden,
  notFound,
} from "@/src/shared-kernel/domain-error";
import type { EventDispatcher } from "@/src/shared-kernel/events";
import type { ObjectStorage, StoredObject } from "@/src/shared-kernel/files";
import { newId } from "@/src/shared-kernel/ids";
import type { PlanGate } from "@/src/shared-kernel/plan";
import {
  isGalleryContentType,
  type ProjectMediaAttached,
  type ProjectMediaRemoved,
} from "@/src/shared-kernel/project-media";

import {
  DOCUMENT_FILE_KIND,
  DOCUMENT_FILE_POLICY,
  DOCUMENT_FILES_MAX,
  REMARK_FILES_MAX,
  documentFileIdOfKey,
  documentFileNotFound,
  documentNotFound,
  gallerySourceOf,
  type DocumentFile,
  type DocumentRemark,
  type LocatedDocument,
} from "../domain/document-thread";
import type { ProcurementDocumentType } from "../domain/documents";
import {
  documentRights,
  hiddenWithoutViewAll,
  mayRemove,
  type DocumentRights,
} from "./document-access";
import type {
  AuthorNames,
  DocumentLocator,
  DocumentThreadStore,
} from "./document-thread-ports";

/** A PDF or an image: the browser shows it, and the Gallery indexes it. */
const VIEWABLE = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export type DocumentFileView = DocumentFile & {
  viewable: boolean;
  createdByName: string | null;
  /** Whether the viewer may remove it. */
  canRemove: boolean;
};

export type DocumentRemarkView = DocumentRemark & {
  createdByName: string | null;
  files: DocumentFileView[];
};

function permissionDenied(): DomainError {
  return forbidden(
    "PERMISSION_DENIED",
    "You do not have permission to do this. Ask the Owner to change your Permission Matrix.",
  );
}

function filesLimit(): DomainError {
  return conflict(
    "DOCUMENT_FILES_LIMIT",
    `Keep at most ${String(DOCUMENT_FILES_MAX)} files on a document. Remove one first.`,
  );
}

export const thumbnailNotFound = () =>
  notFound("THUMBNAIL_NOT_FOUND", "This file has no thumbnail.");

/**
 * The remarks / comments thread and the files of every procurement
 * document (CM-502 … CM-508, ADR CM-0015 §2, CM-0014).
 *
 * Access is the document's menu on its Project (a Store side and the
 * store-only documents on the Company-level menu; a transfer from either
 * side): Read sees the thread and files and may comment; Create or Update
 * uploads; Update removes any file, Create only the member's own. The
 * document must be live and the Company's (404 `<DOCUMENT>_NOT_FOUND`).
 *
 * Remarks are never edited or deleted. Files go up through the kernel's
 * attachments service; a comment's photos are uploaded to the document
 * first and attached by id when posting it. Images and PDFs of a document
 * on a Project join that Project's Gallery (`ProjectMediaAttached`, raised
 * after commit).
 */
export class DocumentThread {
  private readonly uploads: AttachmentUploads;

  constructor(
    private readonly locator: DocumentLocator,
    private readonly store: DocumentThreadStore,
    private readonly names: AuthorNames,
    storage: ObjectStorage,
    plan: PlanGate,
    private readonly media: EventDispatcher,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.uploads = new AttachmentUploads(storage, plan, clock);
  }

  /** The live document and the viewer's rights; 404 then 403 without Read. */
  async open(
    viewer: MemberAccess,
    type: ProcurementDocumentType,
    documentId: string,
  ): Promise<{ document: LocatedDocument; rights: DocumentRights }> {
    const document = await this.locator.locate(
      viewer.workspaceId,
      type,
      documentId,
    );
    if (document == null || hiddenWithoutViewAll(viewer, document))
      throw documentNotFound(type);
    const rights = documentRights(viewer, document);
    if (!rights.read) throw permissionDenied();
    return { document, rights };
  }

  private async openFor(
    viewer: MemberAccess,
    type: ProcurementDocumentType,
    documentId: string,
    right: keyof DocumentRights,
  ) {
    const opened = await this.open(viewer, type, documentId);
    if (!opened.rights[right]) throw permissionDenied();
    return opened;
  }

  private target(document: LocatedDocument): UploadTarget {
    return {
      workspaceId: document.workspaceId,
      ownerId: document.id,
      policy: DOCUMENT_FILE_POLICY,
    };
  }

  private toView(
    file: DocumentFile,
    names: ReadonlyMap<string, string>,
    rights: DocumentRights,
    userId: string,
  ): DocumentFileView {
    return {
      ...file,
      viewable: VIEWABLE.has(file.contentType),
      createdByName: names.get(file.createdBy) ?? null,
      canRemove: mayRemove(rights, file, userId),
    };
  }

  private async namesOf(workspaceId: string, userIds: readonly string[]) {
    return this.names.namesOf(workspaceId, [...new Set(userIds)]);
  }

  /** The thread, oldest first, each remark with its files and author. */
  async thread(
    viewer: MemberAccess,
    type: ProcurementDocumentType,
    documentId: string,
  ): Promise<{ remarks: DocumentRemarkView[]; rights: DocumentRights }> {
    const { rights } = await this.open(viewer, type, documentId);
    const { workspaceId } = viewer;
    const [remarks, files] = await Promise.all([
      this.store.remarks(workspaceId, type, documentId),
      this.store.files(workspaceId, type, documentId),
    ]);
    const names = await this.namesOf(workspaceId, [
      ...remarks.map((remark) => remark.createdBy),
      ...files.map((file) => file.createdBy),
    ]);
    const filesByRemark = new Map<string, DocumentFileView[]>();
    for (const file of files) {
      if (file.remarkId == null) continue;
      const list = filesByRemark.get(file.remarkId) ?? [];
      list.push(this.toView(file, names, rights, viewer.userId));
      filesByRemark.set(file.remarkId, list);
    }
    return {
      remarks: remarks.map((remark) => ({
        ...remark,
        createdByName: names.get(remark.createdBy) ?? null,
        files: filesByRemark.get(remark.id) ?? [],
      })),
      rights,
    };
  }

  /**
   * Posts a remark or comment (Read on the document): 400
   * `REMARK_REQUIRED` / `TEXT_TOO_LONG` (≤ 500), `REMARK_FILES_TOO_MANY`
   * (≤ 10), `DOCUMENT_FILE_NOT_FOUND` for a file that is not the poster's
   * own unattached upload on this document.
   */
  async addRemark(input: {
    viewer: MemberAccess;
    type: ProcurementDocumentType;
    documentId: string;
    body: string;
    fileIds: readonly string[];
  }): Promise<DocumentRemarkView> {
    const { viewer, type, documentId } = input;
    const { document, rights } = await this.openFor(
      viewer,
      type,
      documentId,
      "comment",
    );
    const body = requiredText(input.body, "REMARK_REQUIRED", "body");
    const fileIds = [...new Set(input.fileIds)];
    if (fileIds.length > REMARK_FILES_MAX)
      throw new DomainError(
        "REMARK_FILES_TOO_MANY",
        `Attach at most ${String(REMARK_FILES_MAX)} files to one remark.`,
      );
    const now = this.clock();
    const remark: DocumentRemark = {
      id: newId(now.getTime()),
      workspaceId: document.workspaceId,
      documentType: type,
      documentId,
      body,
      createdAt: now,
      createdBy: viewer.userId,
    };
    const files = await this.store.addRemark({
      document,
      remark,
      fileIds,
      audit: {
        workspaceId: document.workspaceId,
        actorUserId: viewer.userId,
        action: "procurement_remark.created",
        entityType: "procurement_remark",
        entityId: remark.id,
        occurredAt: now,
        after: {
          documentType: type,
          documentId,
          number: document.number,
          body,
          fileIds,
        },
      },
    });
    const names = await this.namesOf(viewer.workspaceId, [viewer.userId]);
    return {
      ...remark,
      createdByName: names.get(viewer.userId) ?? null,
      files: files.map((file) =>
        this.toView(file, names, rights, viewer.userId),
      ),
    };
  }

  /** Live files, oldest first (remarks' files carry their `remarkId`). */
  async files(
    viewer: MemberAccess,
    type: ProcurementDocumentType,
    documentId: string,
  ): Promise<{ files: DocumentFileView[]; rights: DocumentRights }> {
    const { rights } = await this.open(viewer, type, documentId);
    const files = await this.store.files(viewer.workspaceId, type, documentId);
    const names = await this.namesOf(
      viewer.workspaceId,
      files.map((file) => file.createdBy),
    );
    return {
      files: files.map((file) =>
        this.toView(file, names, rights, viewer.userId),
      ),
      rights,
    };
  }

  /**
   * Upload step 1 (Create or Update). 400 `FILE_TYPE_NOT_ALLOWED` for a
   * program, `FILE_TOO_LARGE` above 25 MB; 409 `DOCUMENT_FILES_LIMIT` at
   * 50 files; 402 past the plan's storage.
   */
  async start(input: {
    viewer: MemberAccess;
    type: ProcurementDocumentType;
    documentId: string;
    fileName: string;
    bytes: number;
  }): Promise<StartedUpload> {
    const { document } = await this.openFor(
      input.viewer,
      input.type,
      input.documentId,
      "upload",
    );
    return this.uploads.start(this.target(document), {
      fileName: input.fileName,
      bytes: input.bytes,
      check: async () => {
        if (
          (await this.store.countFiles(
            document.workspaceId,
            document.type,
            document.id,
          )) >= DOCUMENT_FILES_MAX
        )
          throw filesLimit();
      },
    });
  }

  /** Step 2, deployed: the browser's `uploadPresigned()` handshake. */
  async answerDirectUpload(input: {
    viewer: MemberAccess;
    type: ProcurementDocumentType;
    documentId: string;
    request: Request;
    body: unknown;
  }): Promise<unknown> {
    const { viewer, type, documentId } = input;
    const { document } = await this.openFor(viewer, type, documentId, "upload");
    return this.uploads.answerDirectUpload(this.target(document), {
      request: input.request,
      body: input.body,
      authorize: async () => {
        await this.openFor(viewer, type, documentId, "upload");
      },
    });
  }

  /** Step 2, development and tests: the bytes through our route. */
  async receive(input: {
    viewer: MemberAccess;
    type: ProcurementDocumentType;
    documentId: string;
    key: string;
    bytes: Uint8Array;
  }): Promise<void> {
    if (this.uploads.takesDirectUploads())
      throw notFound("NOT_FOUND", "Uploads go straight to storage here.");
    const { document } = await this.openFor(
      input.viewer,
      input.type,
      input.documentId,
      "upload",
    );
    await this.uploads.receive(this.target(document), {
      key: input.key,
      bytes: input.bytes,
    });
  }

  /** An image's browser-made WebP thumbnail, before completing. */
  async receiveThumbnail(input: {
    viewer: MemberAccess;
    type: ProcurementDocumentType;
    documentId: string;
    key: string;
    bytes: Uint8Array;
  }): Promise<void> {
    const { document } = await this.openFor(
      input.viewer,
      input.type,
      input.documentId,
      "upload",
    );
    await this.uploads.receiveThumbnail(this.target(document), {
      key: input.key,
      bytes: input.bytes,
    });
  }

  /**
   * Step 3: records what arrived at `key` (`created` false for a retry).
   * 400 `UPLOAD_NOT_FOUND`, `FILE_EMPTY`, `FILE_TOO_LARGE`,
   * `FILE_TYPE_NOT_ALLOWED`; 409 / 402 as `start`.
   */
  async complete(input: {
    viewer: MemberAccess;
    type: ProcurementDocumentType;
    documentId: string;
    key: string;
    fileName: string;
  }): Promise<{ file: DocumentFileView; created: boolean }> {
    const { viewer, type, documentId, key } = input;
    const { document, rights } = await this.openFor(
      viewer,
      type,
      documentId,
      "upload",
    );
    const { workspaceId } = document;
    const { value, created } = await this.uploads.complete<DocumentFile>(
      this.target(document),
      {
        key,
        fileName: input.fileName,
        recorded: async () => {
          const found = await this.store.fileByKey(
            workspaceId,
            type,
            documentId,
            key,
          );
          if (found == null) return null;
          if (found.deletedAt != null) return { state: "deleted" };
          const { deletedAt: _deletedAt, ...file } = found;
          return { state: "live", value: file };
        },
        record: async (upload) => {
          const id = documentFileIdOfKey(key);
          if (id == null) throw new Error("An attachment key has a uuid.");
          const now = this.clock();
          const file: DocumentFile = {
            id,
            workspaceId,
            documentType: type,
            documentId,
            remarkId: null,
            fileKey: key,
            fileName: upload.fileName,
            contentType: upload.contentType,
            bytes: upload.bytes,
            thumbKey: upload.thumbnail?.key ?? null,
            createdAt: now,
            createdBy: viewer.userId,
          };
          const result = await this.store.addFile({
            document,
            file,
            storedFiles: storedFilesOf(upload, {
              workspaceId,
              kind: DOCUMENT_FILE_KIND,
              by: viewer.userId,
              now,
            }),
            audit: this.fileAudit(document, file, viewer.userId, "added", now),
            maxFiles: DOCUMENT_FILES_MAX,
          });
          if (result === "duplicate") return "duplicate";
          await this.attachToGallery(document, file);
          return file;
        },
      },
    );
    const names = await this.namesOf(workspaceId, [value.createdBy]);
    return {
      file: this.toView(value, names, rights, viewer.userId),
      created,
    };
  }

  private fileAudit(
    document: LocatedDocument,
    file: DocumentFile,
    by: string,
    change: "added" | "removed",
    now: Date,
  ): AuditEvent {
    const summary = {
      documentType: document.type,
      documentId: document.id,
      number: document.number,
      fileId: file.id,
      fileName: file.fileName,
      bytes: file.bytes,
    };
    return {
      workspaceId: document.workspaceId,
      actorUserId: by,
      action: `procurement_document_file.${change}`,
      entityType: "procurement_document_file",
      entityId: file.id,
      occurredAt: now,
      ...(change === "added" ? { after: summary } : { before: summary }),
    };
  }

  /** The Gallery is an index: a failed listener never fails the upload. */
  private async dispatchMedia(
    event: ProjectMediaAttached | ProjectMediaRemoved,
  ): Promise<void> {
    try {
      await this.media.dispatch([event]);
    } catch (error) {
      console.error("Could not update the Project Gallery", error);
    }
  }

  private async attachToGallery(
    document: LocatedDocument,
    file: DocumentFile,
  ): Promise<void> {
    if (
      document.galleryProjectId == null ||
      !isGalleryContentType(file.contentType)
    )
      return;
    await this.dispatchMedia({
      type: "ProjectMediaAttached",
      workspaceId: document.workspaceId,
      occurredAt: file.createdAt,
      projectId: document.galleryProjectId,
      source: gallerySourceOf(document.type),
      sourceId: document.id,
      fileKey: file.fileKey,
      thumbKey: file.thumbKey,
      fileName: file.fileName,
      contentType: file.contentType,
      bytes: file.bytes,
      uploadedBy: file.createdBy,
      uploadedAt: file.createdAt,
    });
  }

  private async live(
    viewer: MemberAccess,
    type: ProcurementDocumentType,
    documentId: string,
    fileId: string,
  ) {
    const opened = await this.open(viewer, type, documentId);
    const file = await this.store.file(
      viewer.workspaceId,
      type,
      documentId,
      fileId,
    );
    if (file == null) throw documentFileNotFound();
    return { ...opened, file };
  }

  /** The file's bytes (Read on the document). */
  async read(
    viewer: MemberAccess,
    type: ProcurementDocumentType,
    documentId: string,
    fileId: string,
  ): Promise<{ file: DocumentFileView; object: StoredObject }> {
    const { file, rights } = await this.live(viewer, type, documentId, fileId);
    const object = await this.uploads.read(file.fileKey);
    if (object == null) throw documentFileNotFound();
    return {
      file: this.toView(file, new Map(), rights, viewer.userId),
      object,
    };
  }

  /** An image's thumbnail; 404 `THUMBNAIL_NOT_FOUND` when none was made. */
  async readThumbnail(
    viewer: MemberAccess,
    type: ProcurementDocumentType,
    documentId: string,
    fileId: string,
  ): Promise<StoredObject> {
    const { file } = await this.live(viewer, type, documentId, fileId);
    const object =
      file.thumbKey == null ? null : await this.uploads.read(file.thumbKey);
    if (object == null) throw thumbnailNotFound();
    return object;
  }

  /**
   * Removes a file: a tombstone, the Gallery row, then the object (best
   * effort). Update removes any file; Create only the member's own.
   */
  async remove(input: {
    viewer: MemberAccess;
    type: ProcurementDocumentType;
    documentId: string;
    fileId: string;
  }): Promise<void> {
    const { viewer } = input;
    const { document, rights, file } = await this.live(
      viewer,
      input.type,
      input.documentId,
      input.fileId,
    );
    if (!mayRemove(rights, file, viewer.userId)) throw permissionDenied();
    const now = this.clock();
    const removed = await this.store.removeFile({
      file,
      by: viewer.userId,
      now,
      audit: this.fileAudit(document, file, viewer.userId, "removed", now),
    });
    if (!removed) throw documentFileNotFound();
    if (document.galleryProjectId != null)
      await this.dispatchMedia({
        type: "ProjectMediaRemoved",
        workspaceId: document.workspaceId,
        occurredAt: now,
        projectId: document.galleryProjectId,
        source: gallerySourceOf(document.type),
        sourceId: document.id,
        fileKey: file.fileKey,
      });
    await this.uploads.discard(
      file.fileKey,
      ...(file.thumbKey == null ? [] : [file.thumbKey]),
    );
  }
}

/** Remarks keep the kernel's text limit (ADR CM-0015 §2). */
export const REMARK_MAX_LENGTH = APPROVAL_LIMITS.maxTextLength;
