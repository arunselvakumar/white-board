import type { MemberAccess } from "@/src/shared-kernel/access";
import {
  AttachmentUploads,
  MULTIPART_FROM_BYTES,
  storedFilesOf,
  type StartedUpload,
  type UploadPolicy,
  type UploadTarget,
} from "@/src/shared-kernel/attachments";
import { recordAudit } from "@/src/shared-kernel/audit";
import { forbidden, notFound } from "@/src/shared-kernel/domain-error";
import {
  IMAGE_LIMITS,
  type ObjectStorage,
  type StoredObject,
} from "@/src/shared-kernel/files";
import {
  markStoredFileDeleted,
  recordStoredFile,
} from "@/src/shared-kernel/files/stored-files";
import type { PlanGate } from "@/src/shared-kernel/plan";

import {
  canChangePhoto,
  canReadEquipment,
  equipmentNotFound,
  type EquipmentStore,
  type StoredEquipment,
} from "./equipment-handlers";
import type { SiteWorkTx } from "./ports";

/** An equipment photo: one image, at most 5 MB, with a thumbnail (CM-603). */
export const EQUIPMENT_PHOTO_MAX_BYTES = IMAGE_LIMITS.equipment_photo;

/** Keys live under `companies/<workspaceId>/equipment-photos/<equipmentId>/…`. */
export const EQUIPMENT_PHOTO_POLICY: UploadPolicy = {
  purpose: "equipment-photos",
  accept: "images",
  maxBytes: EQUIPMENT_PHOTO_MAX_BYTES,
  multipartFromBytes: MULTIPART_FROM_BYTES,
};

/** `stored_files.kind` of a photo (its thumbnail is `equipment_photo_thumbnail`). */
export const EQUIPMENT_PHOTO_FILE_KIND = "equipment_photo";

/** The type a photo is served as, from its key (the policy took images only). */
function photoContentType(key: string): string {
  if (key.endsWith(".png")) return "image/png";
  if (key.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

const permissionDenied = () =>
  forbidden(
    "PERMISSION_DENIED",
    "You do not have permission to do this. Ask the Owner to change your Permission Matrix.",
  );

export type EquipmentPhotoDeps = {
  db: SiteWorkTx & {
    $transaction<T>(fn: (tx: SiteWorkTx) => Promise<T>): Promise<T>;
  };
  store: EquipmentStore;
  storage: ObjectStorage;
  plan: PlanGate;
  clock?: () => Date;
};

/**
 * The equipment photo through the kernel's attachments service (ADR
 * CM-0014), like a quotation: start, the bytes (and the browser's WebP
 * thumbnail), complete. A new photo replaces the old one, whose files stop
 * counting towards storage. Changing it needs Equipments Update, or
 * Equipment Usage Create at the Project it is at; seeing it, read on the
 * equipment.
 */
export class EquipmentPhotos {
  private readonly uploads: AttachmentUploads;
  private readonly clock: () => Date;

  constructor(private readonly deps: EquipmentPhotoDeps) {
    this.clock = deps.clock ?? (() => new Date());
    this.uploads = new AttachmentUploads(deps.storage, deps.plan, this.clock);
  }

  private target(workspaceId: string, id: string): UploadTarget {
    return { workspaceId, ownerId: id, policy: EQUIPMENT_PHOTO_POLICY };
  }

  private async equipment(
    access: MemberAccess,
    id: string,
  ): Promise<StoredEquipment> {
    const found = await this.deps.store.find(
      this.deps.db,
      access.workspaceId,
      id,
    );
    if (found == null) throw equipmentNotFound();
    return found;
  }

  private async writable(
    access: MemberAccess,
    id: string,
  ): Promise<StoredEquipment> {
    const found = await this.equipment(access, id);
    if (!canChangePhoto(access, found)) throw permissionDenied();
    return found;
  }

  /** Step 1: 400 for a name, type or size the policy refuses; 402 past the plan. */
  async start(
    access: MemberAccess,
    id: string,
    input: { fileName: string; bytes: number },
  ): Promise<StartedUpload> {
    await this.writable(access, id);
    return this.uploads.start(this.target(access.workspaceId, id), input);
  }

  /** Step 2, deployed: the `uploadPresigned()` handshake. */
  async answerDirectUpload(
    access: MemberAccess,
    id: string,
    input: { request: Request; body: unknown },
  ): Promise<unknown> {
    return this.uploads.answerDirectUpload(
      this.target(access.workspaceId, id),
      {
        ...input,
        authorize: async () => {
          await this.writable(access, id);
        },
      },
    );
  }

  /** Step 2 in development and tests: the bytes through our route. */
  async receive(
    access: MemberAccess,
    id: string,
    input: { key: string; bytes: Uint8Array },
  ): Promise<void> {
    if (this.uploads.takesDirectUploads())
      throw notFound("NOT_FOUND", "Uploads go straight to storage here.");
    await this.writable(access, id);
    await this.uploads.receive(this.target(access.workspaceId, id), input);
  }

  async receiveThumbnail(
    access: MemberAccess,
    id: string,
    input: { key: string; bytes: Uint8Array },
  ): Promise<void> {
    await this.writable(access, id);
    await this.uploads.receiveThumbnail(
      this.target(access.workspaceId, id),
      input,
    );
  }

  /** Step 3: records the photo at `key`, replacing any earlier one. */
  async complete(
    access: MemberAccess,
    id: string,
    input: { key: string; fileName: string },
  ): Promise<{ created: boolean }> {
    await this.writable(access, id);
    const { db, store } = this.deps;
    let replaced: string[] = [];
    const { created } = await this.uploads.complete<true>(
      this.target(access.workspaceId, id),
      {
        key: input.key,
        fileName: input.fileName,
        recorded: async () => {
          const found = await store.find(db, access.workspaceId, id);
          if (found == null) return { state: "deleted" };
          return found.photoKey === input.key
            ? { state: "live", value: true }
            : null;
        },
        record: async (upload) => {
          const now = this.clock();
          const [file, thumbnail] = storedFilesOf(upload, {
            workspaceId: access.workspaceId,
            kind: EQUIPMENT_PHOTO_FILE_KIND,
            by: access.userId,
            now,
          });
          return db.$transaction(async (tx) => {
            const locked = await store.lock(tx, access.workspaceId, id);
            if (locked == null) throw equipmentNotFound();
            if (locked.photoKey === upload.key) return "duplicate" as const;
            replaced = await this.release(tx, locked, now);
            await store.setPhoto(
              tx,
              id,
              { key: upload.key, thumbKey: upload.thumbnail?.key ?? null },
              access.userId,
              now,
            );
            if (file != null) await recordStoredFile(tx, file);
            if (thumbnail != null) await recordStoredFile(tx, thumbnail);
            await recordAudit(tx, {
              workspaceId: access.workspaceId,
              actorUserId: access.userId,
              action: "equipment.photo_set",
              entityType: "equipment",
              entityId: id,
              occurredAt: now,
              after: { fileName: upload.fileName, bytes: upload.bytes },
            });
            return true as const;
          });
        },
      },
    );
    await this.uploads.discard(...replaced);
    return { created };
  }

  /** Marks the current photo's files deleted; returns their keys. */
  private async release(
    tx: SiteWorkTx,
    equipment: StoredEquipment,
    now: Date,
  ): Promise<string[]> {
    const keys = [equipment.photoKey, equipment.photoThumbKey].filter(
      (key): key is string => key != null,
    );
    for (const key of keys)
      await markStoredFileDeleted(tx, equipment.workspaceId, key, now);
    return keys;
  }

  /** Removes the photo; fine when there is none. */
  async remove(access: MemberAccess, id: string): Promise<void> {
    await this.writable(access, id);
    const { db, store } = this.deps;
    const now = this.clock();
    const released = await db.$transaction(async (tx) => {
      const locked = await store.lock(tx, access.workspaceId, id);
      if (locked == null) throw equipmentNotFound();
      if (locked.photoKey == null) return [];
      const keys = await this.release(tx, locked, now);
      await store.setPhoto(tx, id, null, access.userId, now);
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "equipment.photo_removed",
        entityType: "equipment",
        entityId: id,
        occurredAt: now,
      });
      return keys;
    });
    await this.uploads.discard(...released);
  }

  private async readable(
    access: MemberAccess,
    id: string,
  ): Promise<StoredEquipment> {
    const found = await this.equipment(access, id);
    if (!canReadEquipment(access, found)) throw permissionDenied();
    return found;
  }

  async read(access: MemberAccess, id: string): Promise<StoredObject> {
    const found = await this.readable(access, id);
    const key = found.photoKey;
    const object = key == null ? null : await this.uploads.read(key);
    if (key == null || object == null)
      throw notFound("PHOTO_NOT_FOUND", "This equipment has no photo.");
    return { ...object, contentType: photoContentType(key) };
  }

  /** The WebP thumbnail, or the photo itself when the browser sent none. */
  async readThumbnail(access: MemberAccess, id: string): Promise<StoredObject> {
    const found = await this.readable(access, id);
    const key = found.photoThumbKey ?? found.photoKey;
    const object = key == null ? null : await this.uploads.read(key);
    if (key == null || object == null)
      throw notFound("PHOTO_NOT_FOUND", "This equipment has no photo.");
    return { ...object, contentType: photoContentType(key) };
  }
}
