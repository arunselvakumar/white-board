import { DomainError, conflict, notFound } from "../domain-error";
import { cleanFileName } from "../files/file-name";
import { fileTooLarge, sniffImageType } from "../files/image-file";
import {
  firstBytes,
  type ObjectStorage,
  type StoredObject,
} from "../files/object-storage";
import type { NewStoredFile } from "../files/stored-files";
import type { PlanGate } from "../plan";
import {
  isAttachmentKey,
  newAttachmentKey,
  thumbnailKeyOf,
} from "./attachment-key";
import {
  SNIFF_BYTES,
  acceptsContent,
  isViewableKind,
  sniffUpload,
  type SniffedKind,
} from "./sniff";
import {
  assertNameAccepted,
  assertSizeAccepted,
  programNotAllowed,
  typeNotAccepted,
  type UploadPolicy,
} from "./upload-policy";

/** `storage_gb` is counted in GiB, like the organization context's meter. */
const BYTES_PER_GB = 1024 ** 3;

/** A browser-made thumbnail is a WebP of at most this size (ADR CM-0014). */
export const THUMBNAIL_MAX_BYTES = 300 * 1024;

/** The longer side of a thumbnail, in pixels; the browser draws it. */
export const THUMBNAIL_MAX_EDGE = 480;

/** Whose files these are: the Company, the policy and the owner folder. */
export type UploadTarget = {
  workspaceId: string;
  /** The record the files are filed under, e.g. the Project. */
  ownerId: string;
  policy: UploadPolicy;
};

/** How the browser sends the bytes after `start`. */
export type UploadRoute = { via: "blob"; multipart: boolean } | { via: "app" };

export type StartedUpload = {
  key: string;
  /** The cleaned name, as it will be shown. */
  fileName: string;
  upload: UploadRoute;
};

/**
 * What arrived at a key and passed the policy, ready for the owning
 * context to record in its own transaction with its `stored_files` rows
 * (`storedFilesOf`) and audit event.
 */
export type CheckedUpload = {
  key: string;
  fileName: string;
  /** The type we serve it as (`Sniffed.contentType`). */
  contentType: string;
  kind: Exclude<SniffedKind, "program">;
  bytes: number;
  /** A PDF or an image, which the browser shows and the Gallery indexes. */
  viewable: boolean;
  /** The browser-made WebP of an image, when one was sent. */
  thumbnail: { key: string; bytes: number } | null;
};

/** What the owner already recorded for a key. */
export type RecordedUpload<T> =
  { state: "live"; value: T } | { state: "deleted" } | null;

export function uploadKeyInvalid(): DomainError {
  return new DomainError(
    "UPLOAD_KEY_INVALID",
    "This upload does not belong here. Start the upload again.",
  );
}

export function uploadNotFound(): DomainError {
  return new DomainError(
    "UPLOAD_NOT_FOUND",
    "The file did not finish uploading. Try again.",
  );
}

/**
 * The `stored_files` rows for a checked upload: the file, and its
 * thumbnail (`<kind>_thumbnail`) when there is one. Both count towards
 * the Company's storage.
 */
export function storedFilesOf(
  upload: CheckedUpload,
  input: { workspaceId: string; kind: string; by: string; now: Date },
): NewStoredFile[] {
  const files: NewStoredFile[] = [
    {
      workspaceId: input.workspaceId,
      key: upload.key,
      kind: input.kind,
      contentType: upload.contentType,
      bytes: upload.bytes,
      createdBy: input.by,
      createdAt: input.now,
    },
  ];
  if (upload.thumbnail != null)
    files.push({
      workspaceId: input.workspaceId,
      key: upload.thumbnail.key,
      kind: `${input.kind}_thumbnail`,
      contentType: "image/webp",
      bytes: upload.thumbnail.bytes,
      createdBy: input.by,
      createdAt: input.now,
    });
  return files;
}

/**
 * The direct browser upload every owner of files shares (ADR CM-0010,
 * CM-0014). The bytes never pass through a deployed function (4.5 MB body
 * limit):
 *
 * 1. `start` cleans the name, refuses programs and names the policy does
 *    not accept, checks the size and the plan's storage, and mints the key;
 * 2. the browser sends the file straight to storage (`answerDirectUpload`
 *    signs that one key), or through `receive` where storage is files on
 *    disk; an image's WebP thumbnail goes through `receiveThumbnail`;
 * 3. `complete` checks what actually arrived (size, not a program, content
 *    the policy accepts) and hands a `CheckedUpload` to the owner, which
 *    records it in its own transaction. Completion is idempotent on the
 *    key, and a refused or failed completion deletes what it was about.
 *
 * The owner checks who may upload (Permission Matrix, Project visibility,
 * its own limits) before each call; the kernel never stores a business
 * record.
 */
export class AttachmentUploads {
  constructor(
    private readonly storage: ObjectStorage,
    private readonly plan: PlanGate,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** Best effort: a leftover object costs storage, not correctness. */
  async discard(...keys: string[]): Promise<void> {
    for (const key of keys) {
      try {
        await this.storage.delete(key);
      } catch (error) {
        console.error(`Could not delete ${key} from storage`, error);
      }
    }
  }

  private assertKey(target: UploadTarget, key: string): void {
    if (
      !isAttachmentKey(
        key,
        target.workspaceId,
        target.policy.purpose,
        target.ownerId,
      )
    )
      throw uploadKeyInvalid();
  }

  private async assertPlanRoom(workspaceId: string, bytes: number) {
    await this.plan.assertCanAdd(
      workspaceId,
      "storage_gb",
      bytes / BYTES_PER_GB,
    );
  }

  /**
   * Step 1, before any byte moves. 400 `FILE_TYPE_NOT_ALLOWED` for a
   * program's name or one the policy does not accept, 400
   * `FILE_TOO_LARGE` above the policy, 402 past the plan's storage.
   */
  async start(
    target: UploadTarget,
    input: {
      fileName: string;
      bytes: number;
      /** The owner's own limits, checked after the name and size, before the plan. */
      check?: () => Promise<void>;
    },
  ): Promise<StartedUpload> {
    const { policy } = target;
    const fileName = cleanFileName(input.fileName, "bin");
    assertNameAccepted(policy, fileName);
    if (input.bytes > policy.maxBytes) throw fileTooLarge(policy.maxBytes);
    await input.check?.();
    await this.assertPlanRoom(target.workspaceId, input.bytes);
    const key = newAttachmentKey(
      target.workspaceId,
      policy.purpose,
      target.ownerId,
      fileName,
      this.clock(),
    );
    const upload: UploadRoute =
      this.storage.directUploads == null
        ? { via: "app" }
        : {
            via: "blob",
            multipart: input.bytes >= policy.multipartFromBytes,
          };
    return { key, fileName, upload };
  }

  /** Whether browsers send bytes straight to storage (Vercel Blob). */
  takesDirectUploads(): boolean {
    return this.storage.directUploads != null;
  }

  /**
   * Step 2, deployed: the browser's `uploadPresigned()` handshake, signed
   * for one of this owner's keys and no larger than the policy. `authorize`
   * repeats the owner's checks (the Session may have changed). 404 where
   * storage takes no direct uploads (files on disk).
   */
  async answerDirectUpload(
    target: UploadTarget,
    input: {
      request: Request;
      body: unknown;
      authorize: () => Promise<void>;
    },
  ): Promise<unknown> {
    const direct = this.storage.directUploads;
    if (direct == null)
      throw notFound("NOT_FOUND", "Uploads go through the app on this server.");
    return direct.answer({
      request: input.request,
      body: input.body,
      allow: async (key) => {
        await input.authorize();
        this.assertKey(target, key);
        return { maxBytes: target.policy.maxBytes };
      },
    });
  }

  /**
   * Step 2, development and tests: the bytes through our route, where
   * storage is files on disk. 404 where browsers upload straight to
   * storage; 409 `UPLOAD_EXISTS` rather than replace an object, as Blob
   * refuses to overwrite.
   */
  async receive(
    target: UploadTarget,
    input: { key: string; bytes: Uint8Array },
  ): Promise<void> {
    if (this.storage.directUploads != null)
      throw notFound("NOT_FOUND", "Uploads go straight to storage here.");
    this.assertKey(target, input.key);
    if ((await this.storage.head(input.key)) != null)
      throw conflict("UPLOAD_EXISTS", "This upload was already sent.");
    await this.storage.put(input.key, input.bytes, "application/octet-stream");
  }

  /**
   * The browser-made thumbnail of an image just sent to `key` (ADR
   * CM-0014): a WebP of at most 300 KB, kept at `<key>.thumb.webp` for
   * `complete` to record. 400 `UPLOAD_NOT_FOUND` before the file itself
   * arrived, `FILE_TOO_LARGE`, or `FILE_TYPE_NOT_ALLOWED` for anything but
   * a WebP.
   */
  async receiveThumbnail(
    target: UploadTarget,
    input: { key: string; bytes: Uint8Array },
  ): Promise<void> {
    this.assertKey(target, input.key);
    if (input.bytes.byteLength === 0)
      throw new DomainError("FILE_EMPTY", "The thumbnail is empty.");
    if (input.bytes.byteLength > THUMBNAIL_MAX_BYTES)
      throw fileTooLarge(THUMBNAIL_MAX_BYTES);
    if (sniffImageType(input.bytes) !== "image/webp")
      throw new DomainError(
        "FILE_TYPE_NOT_ALLOWED",
        "A thumbnail must be a WebP image.",
      );
    if ((await this.storage.head(input.key)) == null) throw uploadNotFound();
    await this.storage.put(
      thumbnailKeyOf(input.key),
      input.bytes,
      "image/webp",
    );
  }

  /** The thumbnail sent for `key`, when there is a usable one. */
  private async thumbnailOf(
    key: string,
    kind: SniffedKind,
  ): Promise<{ key: string; bytes: number } | null> {
    const thumbKey = thumbnailKeyOf(key);
    const head = await this.storage.head(thumbKey);
    if (head == null) return null;
    if (kind !== "image" || head.bytes > THUMBNAIL_MAX_BYTES) {
      await this.discard(thumbKey);
      return null;
    }
    return { key: thumbKey, bytes: head.bytes };
  }

  /** The object and any thumbnail sent for it. */
  private async discardWithThumbnail(key: string): Promise<void> {
    const thumbKey = thumbnailKeyOf(key);
    const thumbnail = await this.storage.head(thumbKey).catch(() => null);
    await this.discard(...(thumbnail == null ? [key] : [key, thumbKey]));
  }

  /** Never delete an object a record points at. */
  private async discardUnlessRecorded<T>(
    key: string,
    recorded: () => Promise<RecordedUpload<T>>,
  ): Promise<void> {
    const found = await recorded().catch(() => "unknown" as const);
    if (found == null) await this.discardWithThumbnail(key);
  }

  /**
   * Step 3: checks what arrived at `key` and lets the owner record it.
   * `recorded` says what the owner already has for the key; a live record
   * is returned as it is (`created` false), a deleted one refuses with 400
   * `UPLOAD_NOT_FOUND` and drops the bytes sent again. `record` writes the
   * owner's rows in one transaction, or answers `"duplicate"` when another
   * completion of the same key won the race. 400 `UPLOAD_KEY_INVALID`,
   * `UPLOAD_NOT_FOUND`, `FILE_EMPTY`, `FILE_TOO_LARGE`,
   * `FILE_TYPE_NOT_ALLOWED`; 402 past the plan's storage.
   */
  async complete<T>(
    target: UploadTarget,
    input: {
      key: string;
      fileName: string;
      recorded: () => Promise<RecordedUpload<T>>;
      record: (upload: CheckedUpload) => Promise<T | "duplicate">;
    },
  ): Promise<{ value: T; created: boolean }> {
    const { key, recorded } = input;
    this.assertKey(target, key);

    const existing = await recorded();
    if (existing != null) {
      // Deleted already: whatever was sent there again is not kept.
      if (existing.state === "deleted") {
        await this.discardWithThumbnail(key);
        throw uploadNotFound();
      }
      return { value: existing.value, created: false };
    }

    const head = await this.storage.head(key);
    if (head == null) throw uploadNotFound();
    try {
      const { policy } = target;
      const fileName = cleanFileName(input.fileName, "bin");
      assertNameAccepted(policy, fileName);
      assertSizeAccepted(policy, head.bytes);
      const object = await this.storage.get(key);
      if (object == null) throw uploadNotFound();
      const sniffed = sniffUpload(
        await firstBytes(object, SNIFF_BYTES),
        fileName,
      );
      if (sniffed.kind === "program") throw programNotAllowed(policy);
      if (!acceptsContent(policy.accept, sniffed.kind))
        throw typeNotAccepted(policy);
      const thumbnail = await this.thumbnailOf(key, sniffed.kind);
      await this.assertPlanRoom(
        target.workspaceId,
        head.bytes + (thumbnail?.bytes ?? 0),
      );

      const result = await input.record({
        key,
        fileName,
        contentType: sniffed.contentType,
        kind: sniffed.kind,
        bytes: head.bytes,
        viewable: isViewableKind(sniffed.kind),
        thumbnail,
      });
      if (result === "duplicate") {
        const winner = await recorded();
        if (winner?.state !== "live") throw uploadNotFound();
        return { value: winner.value, created: false };
      }
      return { value: result, created: true };
    } catch (error) {
      await this.discardUnlessRecorded(key, recorded);
      throw error;
    }
  }

  /** The stored object, streamed; null when storage has no such object. */
  read(key: string): Promise<StoredObject | null> {
    return this.storage.get(key);
  }
}
