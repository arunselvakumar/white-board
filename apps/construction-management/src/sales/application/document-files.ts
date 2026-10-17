import { can, type MemberAccess } from "@/src/shared-kernel/access";
import {
  AttachmentUploads,
  storedFilesOf,
  type StartedUpload,
  type UploadTarget,
} from "@/src/shared-kernel/attachments";
import type { AuditEvent } from "@/src/shared-kernel/audit";
import {
  forbidden,
  notFound,
  type DomainError,
} from "@/src/shared-kernel/domain-error";
import type {
  NewStoredFile,
  ObjectStorage,
  StoredObject,
} from "@/src/shared-kernel/files";
import type { PlanGate } from "@/src/shared-kernel/plan";

import {
  assertSalesFileRole,
  SALES_DOCUMENTS,
  SALES_FILE_KIND,
  SALES_FILE_ROLE_RULES,
  salesDocumentNotFound,
  salesFileIdOfKey,
  salesFileNotFound,
  salesFilePolicy,
  salesFilesLimit,
  type LocatedSalesDocument,
  type SalesDocumentFile,
  type SalesDocumentType,
  type SalesFileRole,
} from "../domain/document-files";

// ---------------------------------------------------------------------------
// Ports (Prisma in `infrastructure/document-files-store`)
// ---------------------------------------------------------------------------

/** Finds a live inquiry or booking of the Company. */
export type SalesDocumentLocator = {
  locate(
    workspaceId: string,
    type: SalesDocumentType,
    id: string,
  ): Promise<LocatedSalesDocument | null>;
};

export type StoredSalesDocumentFile = SalesDocumentFile & {
  deletedAt: Date | null;
};

/**
 * `construction_sales.document_files`. `addFile` is one transaction that
 * locks the document's row first, so a document deleted meanwhile gets no
 * new file.
 */
export type SalesDocumentFileStore = {
  /** Live files, oldest first. */
  files(
    workspaceId: string,
    type: SalesDocumentType,
    documentId: string,
  ): Promise<SalesDocumentFile[]>;
  countFiles(
    workspaceId: string,
    type: SalesDocumentType,
    documentId: string,
    role: SalesFileRole,
  ): Promise<number>;
  file(
    workspaceId: string,
    type: SalesDocumentType,
    documentId: string,
    fileId: string,
  ): Promise<SalesDocumentFile | null>;
  fileByKey(
    workspaceId: string,
    type: SalesDocumentType,
    documentId: string,
    key: string,
  ): Promise<StoredSalesDocumentFile | null>;
  /** 409 `DOCUMENT_FILES_LIMIT` at the role's limit; `duplicate` for a retried completion. */
  addFile(input: {
    document: LocatedSalesDocument;
    file: SalesDocumentFile;
    storedFiles: readonly NewStoredFile[];
    audit: AuditEvent;
  }): Promise<"added" | "duplicate">;
  removeFile(input: {
    file: SalesDocumentFile;
    by: string;
    now: Date;
    audit: AuditEvent;
  }): Promise<boolean>;
};

/** The viewer's Team Member on the Project (View all scoping) and uploaders' names. */
export type SalesFilePeople = {
  memberIdOfUser(
    workspaceId: string,
    userId: string,
    projectId: string,
  ): Promise<string | null>;
  namesOf(
    workspaceId: string,
    userIds: readonly string[],
  ): Promise<ReadonlyMap<string, string>>;
};

// ---------------------------------------------------------------------------
// Rights
// ---------------------------------------------------------------------------

/**
 * What a member may do with a sales document's files:
 * - **read**: Read on its menu on its Project, and — for an inquiry
 *   without View all — one they created or are the Assignee or Lead Owner
 *   of (CM-0022 §3);
 * - **upload**: Create or Update;
 * - **remove any file**: Update; with Create only, their own uploads.
 */
export type SalesDocumentRights = {
  read: boolean;
  upload: boolean;
  removeAny: boolean;
  removeOwn: boolean;
};

export function salesDocumentRights(
  access: MemberAccess,
  document: Pick<
    LocatedSalesDocument,
    "type" | "projectId" | "createdBy" | "scopeMemberIds"
  >,
  viewerMemberId: string | null,
): SalesDocumentRights {
  const { menu } = SALES_DOCUMENTS[document.type];
  const scope = { projectId: document.projectId };
  const seen =
    document.scopeMemberIds == null ||
    can(access, menu, "view_all", scope) ||
    document.createdBy === access.userId ||
    (viewerMemberId != null &&
      document.scopeMemberIds.includes(viewerMemberId));
  const read = can(access, menu, "read", scope) && seen;
  const update = can(access, menu, "update", scope);
  const upload = read && (update || can(access, menu, "create", scope));
  return { read, upload, removeAny: read && update, removeOwn: upload };
}

function mayRemove(
  rights: SalesDocumentRights,
  file: { createdBy: string },
  userId: string,
): boolean {
  return rights.removeAny || (rights.removeOwn && file.createdBy === userId);
}

const VIEWABLE = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export type SalesDocumentFileView = SalesDocumentFile & {
  viewable: boolean;
  createdByName: string | null;
  canRemove: boolean;
};

function permissionDenied(): DomainError {
  return forbidden(
    "PERMISSION_DENIED",
    "You do not have permission to do this. Ask the Owner to change your Permission Matrix.",
  );
}

export const salesThumbnailNotFound = () =>
  notFound("THUMBNAIL_NOT_FOUND", "This file has no thumbnail.");

/**
 * The files of inquiries and bookings (ADR CM-0022 §3, §7), built like the
 * tracking document files (CM-0019 §11) with a role per file: an
 * inquiry's Visiting Card (one image) and photos, a booking's Booking Form
 * (one PDF or image) and photos; 25 MB a file. A file that does not see
 * its document (404 `<DOCUMENT>_NOT_FOUND`), View all scoping included,
 * gets nothing. Sales files are personal data, so — unlike every other
 * attachment — they never join the Project Gallery.
 */
export class SalesDocumentFiles {
  private readonly uploads: AttachmentUploads;

  constructor(
    private readonly locator: SalesDocumentLocator,
    private readonly store: SalesDocumentFileStore,
    private readonly people: SalesFilePeople,
    storage: ObjectStorage,
    plan: PlanGate,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.uploads = new AttachmentUploads(storage, plan, clock);
  }

  /**
   * The live document and the viewer's rights: 404 for one the viewer may
   * not see (another Company's, deleted, or outside View all), then 403
   * without Read.
   */
  async open(
    viewer: MemberAccess,
    type: SalesDocumentType,
    documentId: string,
  ): Promise<{
    document: LocatedSalesDocument;
    rights: SalesDocumentRights;
  }> {
    const document = await this.locator.locate(
      viewer.workspaceId,
      type,
      documentId,
    );
    if (document == null) throw salesDocumentNotFound(type);
    const memberId =
      document.scopeMemberIds == null || viewer.role === "owner"
        ? null
        : await this.people.memberIdOfUser(
            viewer.workspaceId,
            viewer.userId,
            document.projectId,
          );
    const rights = salesDocumentRights(viewer, document, memberId);
    if (!rights.read) {
      const { menu } = SALES_DOCUMENTS[type];
      if (can(viewer, menu, "read", { projectId: document.projectId }))
        throw salesDocumentNotFound(type);
      throw permissionDenied();
    }
    return { document, rights };
  }

  /**
   * 404 / 403 as an upload would answer, without the upload: routes call it
   * before they read a request body (review of #92).
   */
  async assertCanUpload(
    viewer: MemberAccess,
    type: SalesDocumentType,
    documentId: string,
  ): Promise<void> {
    await this.openFor(viewer, type, documentId, "upload");
  }

  private async openFor(
    viewer: MemberAccess,
    type: SalesDocumentType,
    documentId: string,
    right: keyof SalesDocumentRights,
  ) {
    const opened = await this.open(viewer, type, documentId);
    if (!opened.rights[right]) throw permissionDenied();
    return opened;
  }

  private target(
    document: LocatedSalesDocument,
    role: SalesFileRole | null,
  ): UploadTarget {
    return {
      workspaceId: document.workspaceId,
      ownerId: document.id,
      policy: salesFilePolicy(role),
    };
  }

  private toView(
    file: SalesDocumentFile,
    names: ReadonlyMap<string, string>,
    rights: SalesDocumentRights,
    userId: string,
  ): SalesDocumentFileView {
    return {
      ...file,
      viewable: VIEWABLE.has(file.contentType),
      createdByName: names.get(file.createdBy) ?? null,
      canRemove: mayRemove(rights, file, userId),
    };
  }

  /** Live files, oldest first, each with its role. */
  async files(
    viewer: MemberAccess,
    type: SalesDocumentType,
    documentId: string,
  ): Promise<{ files: SalesDocumentFileView[]; rights: SalesDocumentRights }> {
    const { rights } = await this.open(viewer, type, documentId);
    const files = await this.store.files(viewer.workspaceId, type, documentId);
    const names = await this.people.namesOf(viewer.workspaceId, [
      ...new Set(files.map((file) => file.createdBy)),
    ]);
    return {
      files: files.map((file) =>
        this.toView(file, names, rights, viewer.userId),
      ),
      rights,
    };
  }

  private async assertRoom(
    document: LocatedSalesDocument,
    role: SalesFileRole,
  ): Promise<void> {
    const count = await this.store.countFiles(
      document.workspaceId,
      document.type,
      document.id,
      role,
    );
    if (count >= SALES_FILE_ROLE_RULES[role].max) throw salesFilesLimit(role);
  }

  /**
   * Upload step 1 for a file of `role`: 400 `FILE_ROLE_NOT_ALLOWED`,
   * `FILE_TYPE_NOT_ALLOWED`, `FILE_TOO_LARGE`; 409 `DOCUMENT_FILES_LIMIT`
   * when the role is full; 402 past the plan's storage.
   */
  async start(input: {
    viewer: MemberAccess;
    type: SalesDocumentType;
    documentId: string;
    role: SalesFileRole;
    fileName: string;
    bytes: number;
  }): Promise<StartedUpload> {
    assertSalesFileRole(input.type, input.role);
    const { document } = await this.openFor(
      input.viewer,
      input.type,
      input.documentId,
      "upload",
    );
    return this.uploads.start(this.target(document, input.role), {
      fileName: input.fileName,
      bytes: input.bytes,
      check: () => this.assertRoom(document, input.role),
    });
  }

  /** Step 2, deployed: the browser's `uploadPresigned()` handshake. */
  async answerDirectUpload(input: {
    viewer: MemberAccess;
    type: SalesDocumentType;
    documentId: string;
    request: Request;
    body: unknown;
  }): Promise<unknown> {
    const { viewer, type, documentId } = input;
    const { document } = await this.openFor(viewer, type, documentId, "upload");
    return this.uploads.answerDirectUpload(this.target(document, null), {
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
    type: SalesDocumentType;
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
    await this.uploads.receive(this.target(document, null), {
      key: input.key,
      bytes: input.bytes,
    });
  }

  /** An image's browser-made WebP thumbnail, before completing. */
  async receiveThumbnail(input: {
    viewer: MemberAccess;
    type: SalesDocumentType;
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
    await this.uploads.receiveThumbnail(this.target(document, null), {
      key: input.key,
      bytes: input.bytes,
    });
  }

  /**
   * Step 3: records what arrived at `key` as a file of `role` (`created`
   * false for a retry). Never indexed in the Gallery.
   */
  async complete(input: {
    viewer: MemberAccess;
    type: SalesDocumentType;
    documentId: string;
    role: SalesFileRole;
    key: string;
    fileName: string;
  }): Promise<{ file: SalesDocumentFileView; created: boolean }> {
    const { viewer, type, documentId, key, role } = input;
    assertSalesFileRole(type, role);
    const { document, rights } = await this.openFor(
      viewer,
      type,
      documentId,
      "upload",
    );
    const { workspaceId } = document;
    const { value, created } = await this.uploads.complete<SalesDocumentFile>(
      this.target(document, role),
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
          const id = salesFileIdOfKey(key);
          if (id == null) throw new Error("An attachment key has a uuid.");
          const now = this.clock();
          const file: SalesDocumentFile = {
            id,
            workspaceId,
            projectId: document.projectId,
            documentType: type,
            documentId,
            role,
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
              kind: SALES_FILE_KIND,
              by: viewer.userId,
              now,
            }),
            audit: this.fileAudit(document, file, viewer.userId, "added", now),
          });
          return result === "duplicate" ? "duplicate" : file;
        },
      },
    );
    const names = await this.people.namesOf(workspaceId, [value.createdBy]);
    return {
      file: this.toView(value, names, rights, viewer.userId),
      created,
    };
  }

  private fileAudit(
    document: LocatedSalesDocument,
    file: SalesDocumentFile,
    by: string,
    change: "added" | "removed",
    now: Date,
  ): AuditEvent {
    const summary = {
      documentType: document.type,
      documentId: document.id,
      role: file.role,
      fileId: file.id,
      fileName: file.fileName,
      bytes: file.bytes,
    };
    return {
      workspaceId: document.workspaceId,
      actorUserId: by,
      action: `sales_document_file.${change}`,
      entityType: "sales_document_file",
      entityId: file.id,
      occurredAt: now,
      ...(change === "added" ? { after: summary } : { before: summary }),
    };
  }

  private async live(
    viewer: MemberAccess,
    type: SalesDocumentType,
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
    if (file == null) throw salesFileNotFound();
    return { ...opened, file };
  }

  /** The file's bytes (Read on the document). */
  async read(
    viewer: MemberAccess,
    type: SalesDocumentType,
    documentId: string,
    fileId: string,
  ): Promise<{ file: SalesDocumentFileView; object: StoredObject }> {
    const { file, rights } = await this.live(viewer, type, documentId, fileId);
    const object = await this.uploads.read(file.fileKey);
    if (object == null) throw salesFileNotFound();
    return {
      file: this.toView(file, new Map(), rights, viewer.userId),
      object,
    };
  }

  async readThumbnail(
    viewer: MemberAccess,
    type: SalesDocumentType,
    documentId: string,
    fileId: string,
  ): Promise<StoredObject> {
    const { file } = await this.live(viewer, type, documentId, fileId);
    const object =
      file.thumbKey == null ? null : await this.uploads.read(file.thumbKey);
    if (object == null) throw salesThumbnailNotFound();
    return object;
  }

  /** Removes a file: a tombstone, then the object (best effort). */
  async remove(input: {
    viewer: MemberAccess;
    type: SalesDocumentType;
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
    if (!removed) throw salesFileNotFound();
    await this.uploads.discard(
      file.fileKey,
      ...(file.thumbKey == null ? [] : [file.thumbKey]),
    );
  }
}
