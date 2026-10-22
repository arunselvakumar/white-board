import { assertCan, can, type MemberAccess } from "@/src/shared-kernel/access";
import {
  AttachmentUploads,
  MULTIPART_FROM_BYTES,
  storedFilesOf,
  type StartedUpload,
  type UploadPolicy,
  type UploadTarget,
} from "@/src/shared-kernel/attachments";
import { recordAudit } from "@/src/shared-kernel/audit";
import {
  conflict,
  forbidden,
  notFound,
  type DomainError,
} from "@/src/shared-kernel/domain-error";
import type { ObjectStorage, StoredObject } from "@/src/shared-kernel/files";
import { recordStoredFile } from "@/src/shared-kernel/files/stored-files";
import { markStoredFileDeleted } from "@/src/shared-kernel/files/stored-files";
import type { PlanGate } from "@/src/shared-kernel/plan";

import { assertNotBilled, measurementNotFound } from "../domain/measurement";
import type { BoqDb, BoqStore } from "./boq-ports";
import {
  MEASUREMENT_MENU,
  type MeasurementStore,
  type StoredMeasurementPhoto,
  type StoredMeasurementSheet,
} from "./measurement-ports";

const MB = 1024 * 1024;

/** A photo on a measurement sheet: one image, at most 25 MB (like a worksheet's). */
export const MEASUREMENT_PHOTO_MAX_BYTES = 25 * MB;

/** A sheet keeps at most this many live photos. */
export const MEASUREMENT_PHOTOS_MAX = 20;

/** Keys live under `companies/<workspaceId>/measurement-photos/<sheetId>/…`. */
export const MEASUREMENT_PHOTO_POLICY: UploadPolicy = {
  purpose: "measurement-photos",
  accept: "images",
  maxBytes: MEASUREMENT_PHOTO_MAX_BYTES,
  multipartFromBytes: MULTIPART_FROM_BYTES,
};

/** `stored_files.kind` of a photo (its thumbnail is `measurement_photo_thumbnail`). */
export const MEASUREMENT_PHOTO_FILE_KIND = "measurement_photo";

const KEY_UUID =
  /\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.[a-z0-9]{1,10}$/;

export type MeasurementPhotoView = StoredMeasurementPhoto & {
  createdByName: string | null;
  canRemove: boolean;
};

export type MeasurementPhotoRights = {
  read: boolean;
  /** Create or Update, while no bill has taken a row. */
  upload: boolean;
  /** Update: any photo. */
  removeAny: boolean;
  /** Create: their own. */
  removeOwn: boolean;
};

function permissionDenied(): DomainError {
  return forbidden(
    "PERMISSION_DENIED",
    "You do not have permission to do this. Ask the Owner to change your Permission Matrix.",
  );
}

export const measurementPhotoNotFound = () =>
  notFound("MEASUREMENT_PHOTO_NOT_FOUND", "This photo was not found.");

export const measurementThumbnailNotFound = () =>
  notFound("THUMBNAIL_NOT_FOUND", "This photo has no thumbnail.");

function photosLimit(): DomainError {
  return conflict(
    "DOCUMENT_FILES_LIMIT",
    `Keep at most ${String(MEASUREMENT_PHOTOS_MAX)} photos on a sheet. Remove one first.`,
    { max: MEASUREMENT_PHOTOS_MAX },
  );
}

export type MeasurementPhotoDeps = {
  db: BoqDb;
  store: MeasurementStore;
  boq: BoqStore;
  storage: ObjectStorage;
  plan: PlanGate;
  clock?: () => Date;
};

/**
 * A measurement sheet's photos (CM-1105, ADR CM-0023 §6) through the
 * kernel's attachments service (CM-0014): start, the bytes (with an
 * image's WebP thumbnail), complete. They are kept in
 * `construction_contracts.measurement_photos` and **not** indexed in the
 * Project Gallery. Read on Measurement Book sees them; Create or Update
 * adds them and removes their own, Update any. Once a bill has taken a row
 * the photos are fixed with the sheet (409 `MEASUREMENT_BILLED`).
 */
export class MeasurementPhotos {
  private readonly uploads: AttachmentUploads;
  private readonly clock: () => Date;

  constructor(private readonly deps: MeasurementPhotoDeps) {
    this.clock = deps.clock ?? (() => new Date());
    this.uploads = new AttachmentUploads(deps.storage, deps.plan, this.clock);
  }

  private async sheet(
    viewer: MemberAccess,
    sheetId: string,
  ): Promise<StoredMeasurementSheet> {
    const sheet = await this.deps.store.find(
      this.deps.db,
      viewer.workspaceId,
      sheetId,
    );
    if (sheet == null) throw measurementNotFound();
    assertCan(viewer, MEASUREMENT_MENU, "read", { projectId: sheet.projectId });
    return sheet;
  }

  async rights(
    viewer: MemberAccess,
    sheet: StoredMeasurementSheet,
  ): Promise<MeasurementPhotoRights> {
    const scope = { projectId: sheet.projectId };
    const billed =
      (await this.deps.store.billedRows(
        this.deps.db,
        viewer.workspaceId,
        sheet.id,
      )) > 0;
    const create = can(viewer, MEASUREMENT_MENU, "create", scope);
    const update = can(viewer, MEASUREMENT_MENU, "update", scope);
    return {
      read: true,
      upload: !billed && (create || update),
      removeAny: !billed && update,
      removeOwn: !billed && (create || update),
    };
  }

  private target(sheet: StoredMeasurementSheet): UploadTarget {
    return {
      workspaceId: sheet.workspaceId,
      ownerId: sheet.id,
      policy: MEASUREMENT_PHOTO_POLICY,
    };
  }

  /** The sheet, refused when the viewer may not upload (404, 403, 409). */
  async assertCanUpload(
    viewer: MemberAccess,
    sheetId: string,
  ): Promise<StoredMeasurementSheet> {
    const sheet = await this.sheet(viewer, sheetId);
    const scope = { projectId: sheet.projectId };
    if (
      !can(viewer, MEASUREMENT_MENU, "create", scope) &&
      !can(viewer, MEASUREMENT_MENU, "update", scope)
    )
      throw permissionDenied();
    assertNotBilled(
      await this.deps.store.billedRows(
        this.deps.db,
        viewer.workspaceId,
        sheetId,
      ),
    );
    return sheet;
  }

  private toView(
    photo: StoredMeasurementPhoto,
    names: ReadonlyMap<string, string>,
    rights: MeasurementPhotoRights,
    userId: string,
  ): MeasurementPhotoView {
    return {
      ...photo,
      createdByName: names.get(photo.createdBy) ?? null,
      canRemove:
        rights.removeAny || (rights.removeOwn && photo.createdBy === userId),
    };
  }

  /** Live photos, oldest first, and whether the viewer may add more. */
  async list(
    viewer: MemberAccess,
    sheetId: string,
  ): Promise<{ photos: MeasurementPhotoView[]; canUpload: boolean }> {
    const sheet = await this.sheet(viewer, sheetId);
    const { db, store } = this.deps;
    const [photos, rights] = await Promise.all([
      store.photos(db, viewer.workspaceId, sheetId),
      this.rights(viewer, sheet),
    ]);
    const names = await store.names(db, viewer.workspaceId, [
      ...new Set(photos.map((photo) => photo.createdBy)),
    ]);
    return {
      photos: photos.map((photo) =>
        this.toView(photo, names, rights, viewer.userId),
      ),
      canUpload: rights.upload,
    };
  }

  private async assertRoom(sheet: StoredMeasurementSheet): Promise<void> {
    const count = (
      await this.deps.store.photoCounts(this.deps.db, sheet.workspaceId, [
        sheet.id,
      ])
    ).get(sheet.id);
    if ((count ?? 0) >= MEASUREMENT_PHOTOS_MAX) throw photosLimit();
  }

  /** Step 1: 400 `FILE_TYPE_NOT_ALLOWED`, `FILE_TOO_LARGE`; 409 at 20 photos; 402 past the plan. */
  async start(input: {
    viewer: MemberAccess;
    sheetId: string;
    fileName: string;
    bytes: number;
  }): Promise<StartedUpload> {
    const sheet = await this.assertCanUpload(input.viewer, input.sheetId);
    return this.uploads.start(this.target(sheet), {
      fileName: input.fileName,
      bytes: input.bytes,
      check: () => this.assertRoom(sheet),
    });
  }

  /** Step 2, deployed: the browser's `uploadPresigned()` handshake. */
  async answerDirectUpload(input: {
    viewer: MemberAccess;
    sheetId: string;
    request: Request;
    body: unknown;
  }): Promise<unknown> {
    const sheet = await this.assertCanUpload(input.viewer, input.sheetId);
    return this.uploads.answerDirectUpload(this.target(sheet), {
      request: input.request,
      body: input.body,
      authorize: async () => {
        await this.assertCanUpload(input.viewer, input.sheetId);
      },
    });
  }

  /** Step 2, development and tests: the bytes through our route. */
  async receive(input: {
    viewer: MemberAccess;
    sheetId: string;
    key: string;
    bytes: Uint8Array;
  }): Promise<void> {
    if (this.uploads.takesDirectUploads())
      throw notFound("NOT_FOUND", "Uploads go straight to storage here.");
    const sheet = await this.assertCanUpload(input.viewer, input.sheetId);
    await this.uploads.receive(this.target(sheet), {
      key: input.key,
      bytes: input.bytes,
    });
  }

  /** An image's browser-made WebP thumbnail, before completing. */
  async receiveThumbnail(input: {
    viewer: MemberAccess;
    sheetId: string;
    key: string;
    bytes: Uint8Array;
  }): Promise<void> {
    const sheet = await this.assertCanUpload(input.viewer, input.sheetId);
    await this.uploads.receiveThumbnail(this.target(sheet), {
      key: input.key,
      bytes: input.bytes,
    });
  }

  private audit(
    photo: StoredMeasurementPhoto,
    by: string,
    change: "added" | "removed",
    at: Date,
  ) {
    const summary = {
      sheetId: photo.sheetId,
      photoId: photo.id,
      fileName: photo.fileName,
      bytes: photo.bytes,
    };
    return {
      workspaceId: photo.workspaceId,
      actorUserId: by,
      action: `measurement_photo.${change}`,
      entityType: "measurement_photo",
      entityId: photo.id,
      occurredAt: at,
      ...(change === "added" ? { after: summary } : { before: summary }),
    };
  }

  /** Step 3: records the photo at `key` (`created` false for a retry). */
  async complete(input: {
    viewer: MemberAccess;
    sheetId: string;
    key: string;
    fileName: string;
  }): Promise<{ photo: MeasurementPhotoView; created: boolean }> {
    const { viewer, sheetId, key } = input;
    const sheet = await this.assertCanUpload(viewer, sheetId);
    const { db, store, boq } = this.deps;
    const ws = viewer.workspaceId;
    const { value, created } =
      await this.uploads.complete<StoredMeasurementPhoto>(this.target(sheet), {
        key,
        fileName: input.fileName,
        recorded: async () => {
          const found = await store.photoByKey(db, ws, sheetId, key);
          if (found == null) return null;
          if (found.deletedAt != null) return { state: "deleted" };
          const { deletedAt: _deletedAt, ...photo } = found;
          return { state: "live", value: photo };
        },
        record: async (upload) => {
          const id = KEY_UUID.exec(key)?.[1];
          if (id == null) throw new Error("An attachment key has a uuid.");
          const at = this.clock();
          const photo: StoredMeasurementPhoto = {
            id,
            workspaceId: ws,
            projectId: sheet.projectId,
            sheetId,
            fileKey: key,
            fileName: upload.fileName,
            contentType: upload.contentType,
            bytes: upload.bytes,
            thumbKey: upload.thumbnail?.key ?? null,
            createdAt: at,
            createdBy: viewer.userId,
          };
          const added = await db.$transaction(async (tx) => {
            await boq.lock(tx, ws, sheet.projectId);
            if ((await store.find(tx, ws, sheetId)) == null)
              throw measurementNotFound();
            assertNotBilled(await store.billedRows(tx, ws, sheetId));
            if ((await store.photoByKey(tx, ws, sheetId, key)) != null)
              return false;
            const count =
              (await store.photoCounts(tx, ws, [sheetId])).get(sheetId) ?? 0;
            if (count >= MEASUREMENT_PHOTOS_MAX) throw photosLimit();
            await store.insertPhoto(tx, photo);
            for (const file of storedFilesOf(upload, {
              workspaceId: ws,
              kind: MEASUREMENT_PHOTO_FILE_KIND,
              by: viewer.userId,
              now: at,
            }))
              await recordStoredFile(tx, file);
            await recordAudit(
              tx,
              this.audit(photo, viewer.userId, "added", at),
            );
            return true;
          });
          return added ? photo : "duplicate";
        },
      });
    const [rights, names] = await Promise.all([
      this.rights(viewer, sheet),
      store.names(db, ws, [value.createdBy]),
    ]);
    return {
      photo: this.toView(value, names, rights, viewer.userId),
      created,
    };
  }

  private async live(viewer: MemberAccess, sheetId: string, photoId: string) {
    const sheet = await this.sheet(viewer, sheetId);
    const photos = await this.deps.store.photos(
      this.deps.db,
      viewer.workspaceId,
      sheetId,
    );
    const photo = photos.find((item) => item.id === photoId);
    if (photo == null) throw measurementPhotoNotFound();
    return { sheet, photo };
  }

  /** The photo's bytes (Read). */
  async read(
    viewer: MemberAccess,
    sheetId: string,
    photoId: string,
  ): Promise<{ photo: StoredMeasurementPhoto; object: StoredObject }> {
    const { photo } = await this.live(viewer, sheetId, photoId);
    const object = await this.uploads.read(photo.fileKey);
    if (object == null) throw measurementPhotoNotFound();
    return { photo, object };
  }

  async readThumbnail(
    viewer: MemberAccess,
    sheetId: string,
    photoId: string,
  ): Promise<StoredObject> {
    const { photo } = await this.live(viewer, sheetId, photoId);
    const object =
      photo.thumbKey == null ? null : await this.uploads.read(photo.thumbKey);
    if (object == null) throw measurementThumbnailNotFound();
    return object;
  }

  /** Removes a photo (Update, or Create for their own): a tombstone, then the object. */
  async remove(input: {
    viewer: MemberAccess;
    sheetId: string;
    photoId: string;
  }): Promise<void> {
    const { viewer } = input;
    const { sheet, photo } = await this.live(
      viewer,
      input.sheetId,
      input.photoId,
    );
    const rights = await this.rights(viewer, sheet);
    if (
      !rights.removeAny &&
      !(rights.removeOwn && photo.createdBy === viewer.userId)
    ) {
      assertNotBilled(
        await this.deps.store.billedRows(
          this.deps.db,
          viewer.workspaceId,
          sheet.id,
        ),
      );
      throw permissionDenied();
    }
    const { db, store, boq } = this.deps;
    const ws = viewer.workspaceId;
    const at = this.clock();
    const removed = await db.$transaction(async (tx) => {
      await boq.lock(tx, ws, sheet.projectId);
      assertNotBilled(await store.billedRows(tx, ws, sheet.id));
      if (!(await store.removePhoto(tx, { photo, by: viewer.userId, at })))
        return false;
      await markStoredFileDeleted(tx, ws, photo.fileKey, at);
      if (photo.thumbKey != null)
        await markStoredFileDeleted(tx, ws, photo.thumbKey, at);
      await recordAudit(tx, this.audit(photo, viewer.userId, "removed", at));
      return true;
    });
    if (!removed) throw measurementPhotoNotFound();
    await this.uploads.discard(
      photo.fileKey,
      ...(photo.thumbKey == null ? [] : [photo.thumbKey]),
    );
  }
}
