import { assertCan, can, type MemberAccess } from "@/src/shared-kernel/access";
import {
  AttachmentUploads,
  storedFilesOf,
  type StartedUpload,
  type UploadTarget,
} from "@/src/shared-kernel/attachments";
import type { AuditEvent } from "@/src/shared-kernel/audit";
import { forbidden, notFound } from "@/src/shared-kernel/domain-error";
import type { ObjectStorage, StoredObject } from "@/src/shared-kernel/files";
import type { PlanGate } from "@/src/shared-kernel/plan";

import {
  VISIT_FILE_KIND,
  VISIT_FILE_POLICY,
  visitFileAlreadySaved,
  visitFileCaption,
  visitFileIdOfKey,
  visitFileLimit,
  visitFileNotFound,
  visitThumbnailNotFound,
  VISIT_FILE_LIMIT,
} from "../domain/visit-files";
import type { StoredVisit, StoredVisitFile, VisitFileStore } from "./ports";
import { VISITS_MENU } from "./visit-handlers";

/** A Visit's file as screens show it. */
export type VisitFileView = StoredVisitFile & {
  /** A PDF or an image, which the browser shows. */
  viewable: boolean;
  createdByName: string | null;
  /** Its uploader, or someone with View all, who can also update. */
  canChange: boolean;
};

const VIEWABLE = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export type VisitFileDeps = {
  /** The live Visit if the viewer may see it; 404 otherwise (ADR CM-0040 §5). */
  visit: (access: MemberAccess, visitId: string) => Promise<StoredVisit>;
  store: VisitFileStore;
  names: (
    workspaceId: string,
    userIds: readonly string[],
  ) => Promise<Map<string, string>>;
  storage: ObjectStorage;
  plan: PlanGate;
  clock?: () => Date;
};

function permissionDenied() {
  return forbidden(
    "PERMISSION_DENIED",
    "You do not have permission to do this. Ask the Owner to change your Permission Matrix.",
  );
}

/**
 * Photos and files on a Visit (PRD §3.6, ADR CM-0040 §9), through the
 * attachments service: images up to 10 MB and PDFs up to 25 MB, 20 live
 * files a Visit. Uploading needs Visits update and the Visit in the
 * viewer's scope; reading needs only that scope. They are never in a
 * Project's Gallery. Adding is allowed past the Visit's edit lock.
 */
export class VisitFiles {
  private readonly uploads: AttachmentUploads;
  private readonly clock: () => Date;

  constructor(private readonly deps: VisitFileDeps) {
    this.clock = deps.clock ?? (() => new Date());
    this.uploads = new AttachmentUploads(deps.storage, deps.plan, this.clock);
  }

  private target(visit: StoredVisit): UploadTarget {
    return {
      workspaceId: visit.workspaceId,
      ownerId: visit.id,
      policy: VISIT_FILE_POLICY,
    };
  }

  /** 404 / 403 as an upload would answer; routes call it before reading a body. */
  async assertCanUpload(
    access: MemberAccess,
    visitId: string,
  ): Promise<StoredVisit> {
    const visit = await this.deps.visit(access, visitId);
    assertCan(access, VISITS_MENU, "update");
    return visit;
  }

  private mayChange(access: MemberAccess, file: StoredVisitFile): boolean {
    return (
      can(access, VISITS_MENU, "update") &&
      (file.createdBy === access.userId || can(access, VISITS_MENU, "view_all"))
    );
  }

  private view(
    access: MemberAccess,
    file: StoredVisitFile,
    names: ReadonlyMap<string, string>,
  ): VisitFileView {
    return {
      ...file,
      viewable: VIEWABLE.has(file.contentType),
      createdByName: names.get(file.createdBy) ?? null,
      canChange: this.mayChange(access, file),
    };
  }

  /** Live files of a Visit, oldest first. */
  async files(access: MemberAccess, visitId: string): Promise<VisitFileView[]> {
    const visit = await this.deps.visit(access, visitId);
    return this.viewsOf(access, visit);
  }

  /** The views of a Visit the caller already opened. */
  async viewsOf(
    access: MemberAccess,
    visit: StoredVisit,
  ): Promise<VisitFileView[]> {
    const files = await this.deps.store.files(visit.workspaceId, [visit.id]);
    const names = await this.deps.names(visit.workspaceId, [
      ...new Set(files.map((file) => file.createdBy)),
    ]);
    return files.map((file) => this.view(access, file, names));
  }

  private async assertRoom(visit: StoredVisit): Promise<void> {
    const count = await this.deps.store.countFiles(visit.workspaceId, visit.id);
    if (count >= VISIT_FILE_LIMIT) throw visitFileLimit();
  }

  /**
   * Step 1: 400 `FILE_TYPE_NOT_ALLOWED`, `FILE_TOO_LARGE` (10 MB for an
   * image, 25 MB for a PDF); 409 `VISIT_FILE_LIMIT` with 20 live; 402 past
   * the plan's storage.
   */
  async start(input: {
    access: MemberAccess;
    visitId: string;
    fileName: string;
    bytes: number;
  }): Promise<StartedUpload> {
    const visit = await this.assertCanUpload(input.access, input.visitId);
    return this.uploads.start(this.target(visit), {
      fileName: input.fileName,
      bytes: input.bytes,
      check: () => this.assertRoom(visit),
    });
  }

  /** Step 2, deployed: the browser's `uploadPresigned()` handshake. */
  async answerDirectUpload(input: {
    access: MemberAccess;
    visitId: string;
    request: Request;
    body: unknown;
  }): Promise<unknown> {
    const visit = await this.assertCanUpload(input.access, input.visitId);
    return this.uploads.answerDirectUpload(this.target(visit), {
      request: input.request,
      body: input.body,
      authorize: async () => {
        await this.assertCanUpload(input.access, input.visitId);
      },
    });
  }

  /** Step 2, development and tests: the bytes through our route. */
  async receive(input: {
    access: MemberAccess;
    visitId: string;
    key: string;
    bytes: Uint8Array;
  }): Promise<void> {
    if (this.uploads.takesDirectUploads())
      throw notFound("NOT_FOUND", "Uploads go straight to storage here.");
    const visit = await this.assertCanUpload(input.access, input.visitId);
    await this.uploads.receive(this.target(visit), {
      key: input.key,
      bytes: input.bytes,
    });
  }

  /**
   * An image's browser-made WebP thumbnail, only while its key awaits
   * completion: 409 `VISIT_FILE_ALREADY_SAVED` once the file is recorded
   * (live or removed), so a saved file's thumbnail is never replaced.
   */
  async receiveThumbnail(input: {
    access: MemberAccess;
    visitId: string;
    key: string;
    bytes: Uint8Array;
  }): Promise<void> {
    const visit = await this.assertCanUpload(input.access, input.visitId);
    const saved = await this.deps.store.fileByKey(
      visit.workspaceId,
      visit.id,
      input.key,
    );
    if (saved != null) throw visitFileAlreadySaved();
    await this.uploads.receiveThumbnail(this.target(visit), {
      key: input.key,
      bytes: input.bytes,
    });
  }

  private audit(
    visit: StoredVisit,
    file: StoredVisitFile,
    by: string,
    change: "file_added" | "file_removed" | "file_captioned",
    now: Date,
  ): AuditEvent {
    const summary = {
      fileId: file.id,
      fileName: file.fileName,
      bytes: file.bytes,
      caption: file.caption,
    };
    return {
      workspaceId: visit.workspaceId,
      actorUserId: by,
      action: `visit.${change}`,
      entityType: "marketing_visit",
      entityId: visit.id,
      occurredAt: now,
      ...(change === "file_removed" ? { before: summary } : { after: summary }),
    };
  }

  /** Step 3: records what arrived at `key` (`created` false for a retry). */
  async complete(input: {
    access: MemberAccess;
    visitId: string;
    key: string;
    fileName: string;
    caption?: string | null;
  }): Promise<{ file: VisitFileView; created: boolean }> {
    const { access, key } = input;
    const caption = visitFileCaption(input.caption);
    const visit = await this.assertCanUpload(access, input.visitId);
    const { workspaceId } = visit;
    const { value, created } = await this.uploads.complete<StoredVisitFile>(
      this.target(visit),
      {
        key,
        fileName: input.fileName,
        recorded: async () => {
          const found = await this.deps.store.fileByKey(
            workspaceId,
            visit.id,
            key,
          );
          if (found == null) return null;
          if (found.deletedAt != null) return { state: "deleted" };
          const { deletedAt: _deletedAt, ...file } = found;
          return { state: "live", value: file };
        },
        record: async (upload) => {
          const id = visitFileIdOfKey(key);
          if (id == null) throw new Error("An attachment key has a uuid.");
          const now = this.clock();
          const file: StoredVisitFile = {
            id,
            workspaceId,
            visitId: visit.id,
            fileKey: key,
            fileName: upload.fileName,
            contentType: upload.contentType,
            bytes: upload.bytes,
            thumbKey: upload.thumbnail?.key ?? null,
            caption,
            createdAt: now,
            createdBy: access.userId,
            updatedAt: now,
          };
          const result = await this.deps.store.addFile({
            file,
            storedFiles: storedFilesOf(upload, {
              workspaceId,
              kind: VISIT_FILE_KIND,
              by: access.userId,
              now,
            }),
            audit: this.audit(visit, file, access.userId, "file_added", now),
          });
          return result === "duplicate" ? "duplicate" : file;
        },
      },
    );
    const names = await this.deps.names(workspaceId, [value.createdBy]);
    return { file: this.view(access, value, names), created };
  }

  private async live(access: MemberAccess, visitId: string, fileId: string) {
    const visit = await this.deps.visit(access, visitId);
    const file = await this.deps.store.file(visit.workspaceId, visitId, fileId);
    if (file == null) throw visitFileNotFound();
    return { visit, file };
  }

  /** The file's bytes, for anyone who may see the Visit. */
  async read(
    access: MemberAccess,
    visitId: string,
    fileId: string,
  ): Promise<{ file: VisitFileView; object: StoredObject }> {
    assertCan(access, VISITS_MENU, "read");
    const { file } = await this.live(access, visitId, fileId);
    const object = await this.uploads.read(file.fileKey);
    if (object == null) throw visitFileNotFound();
    return { file: this.view(access, file, new Map()), object };
  }

  async readThumbnail(
    access: MemberAccess,
    visitId: string,
    fileId: string,
  ): Promise<StoredObject> {
    assertCan(access, VISITS_MENU, "read");
    const { file } = await this.live(access, visitId, fileId);
    const object =
      file.thumbKey == null ? null : await this.uploads.read(file.thumbKey);
    if (object == null) throw visitThumbnailNotFound();
    return object;
  }

  /** A file's caption; its uploader or someone with View all. */
  async setCaption(input: {
    access: MemberAccess;
    visitId: string;
    fileId: string;
    caption: string | null;
  }): Promise<VisitFileView> {
    const { access } = input;
    const caption = visitFileCaption(input.caption);
    const { visit, file } = await this.live(
      access,
      input.visitId,
      input.fileId,
    );
    if (!this.mayChange(access, file)) throw permissionDenied();
    const now = this.clock();
    const changed = { ...file, caption, updatedAt: now };
    const written = await this.deps.store.setCaption({
      file,
      caption,
      now,
      audit: this.audit(visit, changed, access.userId, "file_captioned", now),
    });
    // Removed since it was read: no caption and no audit event.
    if (!written) throw visitFileNotFound();
    const names = await this.deps.names(visit.workspaceId, [file.createdBy]);
    return this.view(access, changed, names);
  }

  /** Removes a file: a tombstone, then the object (best effort). */
  async remove(input: {
    access: MemberAccess;
    visitId: string;
    fileId: string;
  }): Promise<void> {
    const { access } = input;
    const { visit, file } = await this.live(
      access,
      input.visitId,
      input.fileId,
    );
    if (!this.mayChange(access, file)) throw permissionDenied();
    const now = this.clock();
    const removed = await this.deps.store.removeFile({
      file,
      by: access.userId,
      now,
      audit: this.audit(visit, file, access.userId, "file_removed", now),
    });
    if (!removed) throw visitFileNotFound();
    await this.uploads.discard(
      file.fileKey,
      ...(file.thumbKey == null ? [] : [file.thumbKey]),
    );
  }
}
