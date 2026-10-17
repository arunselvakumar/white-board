import { can, type MemberAccess } from "@/src/shared-kernel/access";
import {
  AttachmentUploads,
  storedFilesOf,
  type StartedUpload,
  type UploadTarget,
} from "@/src/shared-kernel/attachments";
import {
  MULTIPART_FROM_BYTES,
  type UploadAccept,
} from "@/src/shared-kernel/attachments/upload-policy";
import type { AuditEvent } from "@/src/shared-kernel/audit";
import {
  conflict,
  forbidden,
  notFound,
  type DomainError,
} from "@/src/shared-kernel/domain-error";
import type { ObjectStorage, StoredObject } from "@/src/shared-kernel/files";
import type { NewStoredFile } from "@/src/shared-kernel/files";
import type { PlanGate } from "@/src/shared-kernel/plan";

import { BOOKING_MENU } from "./sales-booking-deps";

/**
 * A booking's files (CM-1006, ADR CM-0022 §7): its **Booking Form** (one
 * PDF or image) and **photos** (images), in
 * `construction_sales.document_files` with `document_type = booking`.
 * Uploaded through the attachments service (CM-0014) like the tracking
 * documents' files, but sales files are personal data: they are **not**
 * indexed in the Project Gallery.
 *
 * Booking Read sees and opens them; Create or Update uploads; Update
 * removes any, an uploader their own. The booking must be live and the
 * Company's (404 `BOOKING_NOT_FOUND`).
 *
 * (A thin booking-only module: CM-1003's generic sales files fold it in
 * at integration.)
 */

export const BOOKING_FILE_ROLES = ["booking_form", "photo"] as const;
export type BookingFileRole = (typeof BOOKING_FILE_ROLES)[number];

export const BOOKING_FILE_ROLE_LABELS: Record<BookingFileRole, string> = {
  booking_form: "Booking Form",
  photo: "Photo",
};

const MB = 1024 * 1024;
export const BOOKING_FILE_MAX_BYTES = 25 * MB;
/** Live files one booking keeps (one Booking Form, the rest photos). */
export const BOOKING_FILES_MAX = 30;
export const BOOKING_FILE_ACCEPTS: Record<BookingFileRole, UploadAccept> = {
  booking_form: "pdf_or_image",
  photo: "images",
};
/** Key folder: `companies/<workspaceId>/sales-documents/<bookingId>/…`. */
export const BOOKING_FILE_PURPOSE = "sales-documents";
/** `stored_files.kind` (and `<kind>_thumbnail`). */
export const BOOKING_FILE_KIND = "sales_document_file";

/** A live booking as its files see it. */
export type LocatedBooking = {
  id: string;
  workspaceId: string;
  projectId: string;
};

export type BookingFile = {
  id: string;
  workspaceId: string;
  projectId: string;
  bookingId: string;
  role: BookingFileRole;
  fileKey: string;
  fileName: string;
  contentType: string;
  bytes: number;
  thumbKey: string | null;
  createdAt: Date;
  createdBy: string;
};

export type BookingFileView = BookingFile & {
  viewable: boolean;
  createdByName: string | null;
  canRemove: boolean;
};

export type BookingFileRights = {
  read: boolean;
  upload: boolean;
  removeAny: boolean;
};

/** `construction_sales.document_files` of bookings (Prisma in infrastructure). */
export type BookingFileStore = {
  locate(
    workspaceId: string,
    bookingId: string,
  ): Promise<LocatedBooking | null>;
  files(workspaceId: string, bookingId: string): Promise<BookingFile[]>;
  count(workspaceId: string, bookingId: string): Promise<number>;
  file(
    workspaceId: string,
    bookingId: string,
    fileId: string,
  ): Promise<BookingFile | null>;
  /** The file at this key, live or removed (`deletedAt`), or null. */
  fileByKey(
    workspaceId: string,
    bookingId: string,
    key: string,
  ): Promise<(BookingFile & { deletedAt: Date | null }) | null>;
  /**
   * Inserts the file with its `stored_files` rows and audit event, holding
   * the booking's row: 404 when the booking went meanwhile, 409
   * `DOCUMENT_FILES_LIMIT` / `BOOKING_FORM_EXISTS`; `duplicate` for a key
   * already recorded (a retried completion).
   */
  add(input: {
    booking: LocatedBooking;
    file: BookingFile;
    storedFiles: readonly NewStoredFile[];
    audit: AuditEvent;
  }): Promise<"added" | "duplicate">;
  /** Tombstones it and stops counting its bytes; false when already gone. */
  remove(input: {
    file: BookingFile;
    by: string;
    now: Date;
    audit: AuditEvent;
  }): Promise<boolean>;
  namesOf(
    workspaceId: string,
    userIds: readonly string[],
  ): Promise<ReadonlyMap<string, string>>;
};

const VIEWABLE = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

const KEY_UUID =
  /\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.[a-z0-9]{1,10}$/;

/** A file's id is the uuid its key was minted with. */
export function bookingFileIdOfKey(key: string): string | null {
  return KEY_UUID.exec(key)?.[1] ?? null;
}

export const bookingFileNotFound = () =>
  notFound("DOCUMENT_FILE_NOT_FOUND", "This file was not found.");

export const bookingNotFoundForFiles = () =>
  notFound("BOOKING_NOT_FOUND", "This booking was not found.");

export const bookingFilesLimit = () =>
  conflict(
    "DOCUMENT_FILES_LIMIT",
    `Keep at most ${String(BOOKING_FILES_MAX)} files on a booking. Remove one first.`,
  );

export const bookingFormExists = () =>
  conflict(
    "BOOKING_FORM_EXISTS",
    "This booking already has its Booking Form. Remove it first to upload another.",
  );

export const bookingThumbnailNotFound = () =>
  notFound("THUMBNAIL_NOT_FOUND", "This file has no thumbnail.");

function permissionDenied(): DomainError {
  return forbidden(
    "PERMISSION_DENIED",
    "You do not have permission to do this. Ask the Owner to change your Permission Matrix.",
  );
}

export function bookingFileRights(
  viewer: MemberAccess,
  booking: LocatedBooking,
): BookingFileRights {
  const scope = { projectId: booking.projectId };
  const update = can(viewer, BOOKING_MENU, "update", scope);
  return {
    read: can(viewer, BOOKING_MENU, "read", scope),
    upload: update || can(viewer, BOOKING_MENU, "create", scope),
    removeAny: update,
  };
}

export class BookingFiles {
  private readonly uploads: AttachmentUploads;

  constructor(
    private readonly store: BookingFileStore,
    storage: ObjectStorage,
    plan: PlanGate,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.uploads = new AttachmentUploads(storage, plan, clock);
  }

  /** The live booking and the viewer's rights; 404 then 403 without Read. */
  async open(viewer: MemberAccess, bookingId: string) {
    const booking = await this.store.locate(viewer.workspaceId, bookingId);
    if (booking == null) throw bookingNotFoundForFiles();
    const rights = bookingFileRights(viewer, booking);
    if (!rights.read) throw permissionDenied();
    return { booking, rights };
  }

  private async openToUpload(viewer: MemberAccess, bookingId: string) {
    const opened = await this.open(viewer, bookingId);
    if (!opened.rights.upload) throw permissionDenied();
    return opened;
  }

  private target(booking: LocatedBooking, role: BookingFileRole): UploadTarget {
    return {
      workspaceId: booking.workspaceId,
      ownerId: booking.id,
      policy: {
        purpose: BOOKING_FILE_PURPOSE,
        accept: BOOKING_FILE_ACCEPTS[role],
        maxBytes: BOOKING_FILE_MAX_BYTES,
        multipartFromBytes: MULTIPART_FROM_BYTES,
      },
    };
  }

  private toView(
    file: BookingFile,
    names: ReadonlyMap<string, string>,
    rights: BookingFileRights,
    userId: string,
  ): BookingFileView {
    return {
      ...file,
      viewable: VIEWABLE.has(file.contentType),
      createdByName: names.get(file.createdBy) ?? null,
      canRemove:
        rights.removeAny || (rights.upload && file.createdBy === userId),
    };
  }

  /** Live files, oldest first. */
  async files(viewer: MemberAccess, bookingId: string) {
    const { rights } = await this.open(viewer, bookingId);
    const files = await this.store.files(viewer.workspaceId, bookingId);
    const names = await this.store.namesOf(viewer.workspaceId, [
      ...new Set(files.map((file) => file.createdBy)),
    ]);
    return {
      files: files.map((file) =>
        this.toView(file, names, rights, viewer.userId),
      ),
      rights,
    };
  }

  /**
   * Upload step 1. 400 `FILE_TYPE_NOT_ALLOWED` for a name the role refuses
   * (a photo must be an image), `FILE_TOO_LARGE` above 25 MB; 409
   * `DOCUMENT_FILES_LIMIT` / `BOOKING_FORM_EXISTS`; 402 past the plan.
   */
  async start(input: {
    viewer: MemberAccess;
    bookingId: string;
    role: BookingFileRole;
    fileName: string;
    bytes: number;
  }): Promise<StartedUpload> {
    const { booking } = await this.openToUpload(input.viewer, input.bookingId);
    return this.uploads.start(this.target(booking, input.role), {
      fileName: input.fileName,
      bytes: input.bytes,
      check: async () => {
        const files = await this.store.files(booking.workspaceId, booking.id);
        if (files.length >= BOOKING_FILES_MAX) throw bookingFilesLimit();
        if (
          input.role === "booking_form" &&
          files.some((file) => file.role === "booking_form")
        )
          throw bookingFormExists();
      },
    });
  }

  /**
   * Step 2, deployed: the browser's `uploadPresigned()` handshake. The
   * bytes go up under the widest policy (a PDF or an image); `complete`
   * checks them against the role's.
   */
  async answerDirectUpload(input: {
    viewer: MemberAccess;
    bookingId: string;
    request: Request;
    body: unknown;
  }): Promise<unknown> {
    const { booking } = await this.openToUpload(input.viewer, input.bookingId);
    return this.uploads.answerDirectUpload(
      this.target(booking, "booking_form"),
      {
        request: input.request,
        body: input.body,
        authorize: async () => {
          await this.openToUpload(input.viewer, input.bookingId);
        },
      },
    );
  }

  /** Step 2, development and tests: the bytes through our route. */
  async receive(input: {
    viewer: MemberAccess;
    bookingId: string;
    key: string;
    bytes: Uint8Array;
  }): Promise<void> {
    if (this.uploads.takesDirectUploads())
      throw notFound("NOT_FOUND", "Uploads go straight to storage here.");
    const { booking } = await this.openToUpload(input.viewer, input.bookingId);
    await this.uploads.receive(this.target(booking, "booking_form"), {
      key: input.key,
      bytes: input.bytes,
    });
  }

  /** An image's browser-made WebP thumbnail, before completing. */
  async receiveThumbnail(input: {
    viewer: MemberAccess;
    bookingId: string;
    key: string;
    bytes: Uint8Array;
  }): Promise<void> {
    const { booking } = await this.openToUpload(input.viewer, input.bookingId);
    await this.uploads.receiveThumbnail(this.target(booking, "photo"), {
      key: input.key,
      bytes: input.bytes,
    });
  }

  /**
   * Step 3: records what arrived at `key` as a Booking Form or a photo
   * (`created` false for a retry). Not indexed in the Gallery.
   */
  async complete(input: {
    viewer: MemberAccess;
    bookingId: string;
    role: BookingFileRole;
    key: string;
    fileName: string;
  }): Promise<{ file: BookingFileView; created: boolean }> {
    const { viewer, bookingId, key, role } = input;
    const { booking, rights } = await this.openToUpload(viewer, bookingId);
    const { workspaceId } = booking;
    const { value, created } = await this.uploads.complete<BookingFile>(
      this.target(booking, role),
      {
        key,
        fileName: input.fileName,
        recorded: async () => {
          const found = await this.store.fileByKey(workspaceId, bookingId, key);
          if (found == null) return null;
          if (found.deletedAt != null) return { state: "deleted" };
          const { deletedAt: _deletedAt, ...file } = found;
          return { state: "live", value: file };
        },
        record: async (upload) => {
          const id = bookingFileIdOfKey(key);
          if (id == null) throw new Error("An attachment key has a uuid.");
          const now = this.clock();
          const file: BookingFile = {
            id,
            workspaceId,
            projectId: booking.projectId,
            bookingId,
            role,
            fileKey: key,
            fileName: upload.fileName,
            contentType: upload.contentType,
            bytes: upload.bytes,
            thumbKey: upload.thumbnail?.key ?? null,
            createdAt: now,
            createdBy: viewer.userId,
          };
          const result = await this.store.add({
            booking,
            file,
            storedFiles: storedFilesOf(upload, {
              workspaceId,
              kind: BOOKING_FILE_KIND,
              by: viewer.userId,
              now,
            }),
            audit: this.audit(file, viewer.userId, "added", now),
          });
          return result === "duplicate" ? "duplicate" : file;
        },
      },
    );
    const names = await this.store.namesOf(workspaceId, [value.createdBy]);
    return {
      file: this.toView(value, names, rights, viewer.userId),
      created,
    };
  }

  private audit(
    file: BookingFile,
    by: string,
    change: "added" | "removed",
    now: Date,
  ): AuditEvent {
    const summary = {
      documentType: "booking",
      documentId: file.bookingId,
      role: file.role,
      fileId: file.id,
      fileName: file.fileName,
      bytes: file.bytes,
    };
    return {
      workspaceId: file.workspaceId,
      actorUserId: by,
      action: `sales_document_file.${change}`,
      entityType: "sales_document_file",
      entityId: file.id,
      occurredAt: now,
      ...(change === "added" ? { after: summary } : { before: summary }),
    };
  }

  private async live(viewer: MemberAccess, bookingId: string, fileId: string) {
    const opened = await this.open(viewer, bookingId);
    const file = await this.store.file(viewer.workspaceId, bookingId, fileId);
    if (file == null) throw bookingFileNotFound();
    return { ...opened, file };
  }

  /** The file's bytes (Booking Read). */
  async read(
    viewer: MemberAccess,
    bookingId: string,
    fileId: string,
  ): Promise<{ file: BookingFileView; object: StoredObject }> {
    const { file, rights } = await this.live(viewer, bookingId, fileId);
    const object = await this.uploads.read(file.fileKey);
    if (object == null) throw bookingFileNotFound();
    return {
      file: this.toView(file, new Map(), rights, viewer.userId),
      object,
    };
  }

  async readThumbnail(
    viewer: MemberAccess,
    bookingId: string,
    fileId: string,
  ): Promise<StoredObject> {
    const { file } = await this.live(viewer, bookingId, fileId);
    const object =
      file.thumbKey == null ? null : await this.uploads.read(file.thumbKey);
    if (object == null) throw bookingThumbnailNotFound();
    return object;
  }

  /** Removes a file: a tombstone, then the object (best effort). */
  async remove(input: {
    viewer: MemberAccess;
    bookingId: string;
    fileId: string;
  }): Promise<void> {
    const { viewer } = input;
    const { rights, file } = await this.live(
      viewer,
      input.bookingId,
      input.fileId,
    );
    if (!this.toView(file, new Map(), rights, viewer.userId).canRemove)
      throw permissionDenied();
    const now = this.clock();
    const removed = await this.store.remove({
      file,
      by: viewer.userId,
      now,
      audit: this.audit(file, viewer.userId, "removed", now),
    });
    if (!removed) throw bookingFileNotFound();
    await this.uploads.discard(
      file.fileKey,
      ...(file.thumbKey == null ? [] : [file.thumbKey]),
    );
  }
}
