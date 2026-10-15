import type { MemberAccess } from "@/src/shared-kernel/access";
import {
  AttachmentUploads,
  storedFilesOf,
  type StartedUpload,
  type UploadTarget,
} from "@/src/shared-kernel/attachments";
import type { AuditEvent } from "@/src/shared-kernel/audit";
import {
  conflict,
  forbidden,
  notFound,
  type DomainError,
} from "@/src/shared-kernel/domain-error";
import type { EventDispatcher } from "@/src/shared-kernel/events";
import type { ObjectStorage, StoredObject } from "@/src/shared-kernel/files";
import type { PlanGate } from "@/src/shared-kernel/plan";
import type {
  ProjectMediaAttached,
  ProjectMediaRemoved,
} from "@/src/shared-kernel/project-media";

import {
  TRACKING_DOCUMENT_FILES_MAX,
  TRACKING_FILE_KIND,
  inspectionFilesFinal,
  trackingDocumentNotFound,
  trackingFileIdOfKey,
  trackingFileJoinsGallery,
  trackingFileNotFound,
  trackingFilePolicy,
  trackingGallerySource,
  type LocatedTrackingDocument,
  type TrackingDocumentFile,
} from "../domain/document-files";
import type { TrackingDocumentType } from "../domain/tracking-documents";
import {
  mayRemoveTrackingFile,
  trackingDocumentRights,
  trackingFilesFinal,
  type TrackingDocumentRights,
} from "./document-access";
import type {
  TrackingDocumentFileStore,
  TrackingDocumentLocator,
  TrackingFilePeople,
} from "./document-files-ports";

/** A PDF or an image: the browser shows it. */
const VIEWABLE = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export type TrackingDocumentFileView = TrackingDocumentFile & {
  viewable: boolean;
  createdByName: string | null;
  /** Whether the viewer may remove it. */
  canRemove: boolean;
};

function permissionDenied(): DomainError {
  return forbidden(
    "PERMISSION_DENIED",
    "You do not have permission to do this. Ask the Owner to change your Permission Matrix.",
  );
}

function filesLimit(max: number): DomainError {
  return conflict(
    "DOCUMENT_FILES_LIMIT",
    `Keep at most ${String(max)} files on a document. Remove one first.`,
  );
}

export const trackingThumbnailNotFound = () =>
  notFound("THUMBNAIL_NOT_FOUND", "This file has no thumbnail.");

/**
 * The files of every tracking document: task progress photos, issue images
 * and attachments, inspection files and observation files (ADR CM-0019
 * §11). Built like the site-work document files (CM-0016 §8).
 *
 * Access is the document's menu on its Project (`trackingDocumentRights`):
 * Read (and View all scoping on tasks and issues) sees and opens files;
 * Update uploads task photos, Create or Update issue and inspection files;
 * Update removes any file, an uploader their own. The document must be live
 * and the Company's (404 `<DOCUMENT>_NOT_FOUND`).
 *
 * Task files are images only; issue and inspection files a PDF or an
 * image; 25 MB a file, 200 files a document, 10 an entry. An entry's files
 * are uploaded to the document first and attached by id when the entry is
 * posted (`attachEntryFiles`). Images and PDFs join the Project's Gallery
 * (`ProjectMediaAttached`, raised after commit).
 */
export class TrackingDocumentFiles {
  private readonly uploads: AttachmentUploads;

  constructor(
    private readonly locator: TrackingDocumentLocator,
    private readonly store: TrackingDocumentFileStore,
    private readonly people: TrackingFilePeople,
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
    type: TrackingDocumentType,
    documentId: string,
  ): Promise<{
    document: LocatedTrackingDocument;
    rights: TrackingDocumentRights;
  }> {
    const document = await this.locator.locate(
      viewer.workspaceId,
      type,
      documentId,
    );
    if (document == null) throw trackingDocumentNotFound(type);
    // The viewer's Team Member: for View all scoping on tasks and issues,
    // and for an inspection's inspector (CM-804).
    const needsMember =
      document.assigneeMemberIds != null ||
      document.inspection?.inspectorMemberId != null;
    const memberId =
      !needsMember || viewer.role === "owner"
        ? null
        : await this.people.memberIdOfUser(viewer.workspaceId, viewer.userId);
    const rights = trackingDocumentRights(viewer, document, memberId);
    if (!rights.read) throw permissionDenied();
    return { document, rights };
  }

  private async openFor(
    viewer: MemberAccess,
    type: TrackingDocumentType,
    documentId: string,
    right: keyof TrackingDocumentRights,
  ) {
    const opened = await this.open(viewer, type, documentId);
    const final = trackingFilesFinal(opened.document);
    if (final != null && right !== "read") throw inspectionFilesFinal(final);
    if (!opened.rights[right]) throw permissionDenied();
    return opened;
  }

  private target(document: LocatedTrackingDocument): UploadTarget {
    return {
      workspaceId: document.workspaceId,
      ownerId: document.id,
      policy: trackingFilePolicy(document.type),
    };
  }

  private toView(
    file: TrackingDocumentFile,
    names: ReadonlyMap<string, string>,
    rights: TrackingDocumentRights,
    userId: string,
  ): TrackingDocumentFileView {
    return {
      ...file,
      viewable: VIEWABLE.has(file.contentType),
      createdByName: names.get(file.createdBy) ?? null,
      canRemove: mayRemoveTrackingFile(rights, file, userId),
    };
  }

  private namesOf(workspaceId: string, userIds: readonly string[]) {
    return this.people.namesOf(workspaceId, [...new Set(userIds)]);
  }

  /** Live files, oldest first (entries' files carry their `entryId`). */
  async files(
    viewer: MemberAccess,
    type: TrackingDocumentType,
    documentId: string,
  ): Promise<{
    files: TrackingDocumentFileView[];
    rights: TrackingDocumentRights;
  }> {
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
   * Upload step 1. 400 `FILE_TYPE_NOT_ALLOWED` for a name the document's
   * policy refuses, `FILE_TOO_LARGE` above 25 MB; 409
   * `DOCUMENT_FILES_LIMIT` at 200 files; 402 past the plan's storage.
   */
  async start(input: {
    viewer: MemberAccess;
    type: TrackingDocumentType;
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
          )) >= TRACKING_DOCUMENT_FILES_MAX
        )
          throw filesLimit(TRACKING_DOCUMENT_FILES_MAX);
      },
    });
  }

  /** Step 2, deployed: the browser's `uploadPresigned()` handshake. */
  async answerDirectUpload(input: {
    viewer: MemberAccess;
    type: TrackingDocumentType;
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
    type: TrackingDocumentType;
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
    type: TrackingDocumentType;
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
   * `FILE_TYPE_NOT_ALLOWED` (content the policy refuses); 409 / 402 as
   * `start`.
   */
  async complete(input: {
    viewer: MemberAccess;
    type: TrackingDocumentType;
    documentId: string;
    key: string;
    fileName: string;
  }): Promise<{ file: TrackingDocumentFileView; created: boolean }> {
    const { viewer, type, documentId, key } = input;
    const { document, rights } = await this.openFor(
      viewer,
      type,
      documentId,
      "upload",
    );
    const { workspaceId } = document;
    const { value, created } =
      await this.uploads.complete<TrackingDocumentFile>(this.target(document), {
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
          const id = trackingFileIdOfKey(key);
          if (id == null) throw new Error("An attachment key has a uuid.");
          const now = this.clock();
          const file: TrackingDocumentFile = {
            id,
            workspaceId,
            projectId: document.projectId,
            documentType: type,
            documentId,
            entryId: null,
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
              kind: TRACKING_FILE_KIND,
              by: viewer.userId,
              now,
            }),
            audit: this.fileAudit(document, file, viewer.userId, "added", now),
            maxFiles: TRACKING_DOCUMENT_FILES_MAX,
          });
          if (result === "duplicate") return "duplicate";
          await this.attachToGallery(document, file);
          return file;
        },
      });
    const names = await this.namesOf(workspaceId, [value.createdBy]);
    return {
      file: this.toView(value, names, rights, viewer.userId),
      created,
    };
  }

  private fileAudit(
    document: LocatedTrackingDocument,
    file: TrackingDocumentFile,
    by: string,
    change: "added" | "removed",
    now: Date,
  ): AuditEvent {
    const summary = {
      documentType: document.type,
      documentId: document.id,
      label: document.label,
      entryId: file.entryId,
      fileId: file.id,
      fileName: file.fileName,
      bytes: file.bytes,
    };
    return {
      workspaceId: document.workspaceId,
      actorUserId: by,
      action: `tracking_document_file.${change}`,
      entityType: "tracking_document_file",
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
    document: LocatedTrackingDocument,
    file: TrackingDocumentFile,
  ): Promise<void> {
    if (!trackingFileJoinsGallery(file.contentType)) return;
    await this.dispatchMedia({
      type: "ProjectMediaAttached",
      workspaceId: document.workspaceId,
      occurredAt: file.createdAt,
      projectId: document.projectId,
      source: trackingGallerySource(document.type),
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
    type: TrackingDocumentType,
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
    if (file == null) throw trackingFileNotFound();
    return { ...opened, file };
  }

  /** The file's bytes (Read on the document). */
  async read(
    viewer: MemberAccess,
    type: TrackingDocumentType,
    documentId: string,
    fileId: string,
  ): Promise<{ file: TrackingDocumentFileView; object: StoredObject }> {
    const { file, rights } = await this.live(viewer, type, documentId, fileId);
    const object = await this.uploads.read(file.fileKey);
    if (object == null) throw trackingFileNotFound();
    return {
      file: this.toView(file, new Map(), rights, viewer.userId),
      object,
    };
  }

  /** An image's thumbnail; 404 `THUMBNAIL_NOT_FOUND` when none was made. */
  async readThumbnail(
    viewer: MemberAccess,
    type: TrackingDocumentType,
    documentId: string,
    fileId: string,
  ): Promise<StoredObject> {
    const { file } = await this.live(viewer, type, documentId, fileId);
    const object =
      file.thumbKey == null ? null : await this.uploads.read(file.thumbKey);
    if (object == null) throw trackingThumbnailNotFound();
    return object;
  }

  /**
   * Removes a file: a tombstone, the Gallery row, then the object (best
   * effort). Update removes any file; an uploader their own.
   */
  async remove(input: {
    viewer: MemberAccess;
    type: TrackingDocumentType;
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
    const final = trackingFilesFinal(document);
    if (final != null) throw inspectionFilesFinal(final);
    if (!mayRemoveTrackingFile(rights, file, viewer.userId))
      throw permissionDenied();
    const now = this.clock();
    const removed = await this.store.removeFile({
      file,
      by: viewer.userId,
      now,
      audit: this.fileAudit(document, file, viewer.userId, "removed", now),
    });
    if (!removed) throw trackingFileNotFound();
    if (trackingFileJoinsGallery(file.contentType))
      await this.dispatchMedia({
        type: "ProjectMediaRemoved",
        workspaceId: document.workspaceId,
        occurredAt: now,
        projectId: document.projectId,
        source: trackingGallerySource(document.type),
        sourceId: document.id,
        fileKey: file.fileKey,
      });
    await this.uploads.discard(
      file.fileKey,
      ...(file.thumbKey == null ? [] : [file.thumbKey]),
    );
  }

  /**
   * Takes files out of the Gallery after the caller's transaction removed
   * them (an entry deleted with `tombstoneEntryFiles`, or a whole document:
   * pass `trackingDocumentMediaRemoved(...)`). Never throws.
   */
  async dispatchRemoved(events: readonly ProjectMediaRemoved[]): Promise<void> {
    for (const event of events) await this.dispatchMedia(event);
  }
}
