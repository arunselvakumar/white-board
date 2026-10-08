import {
  checkImage,
  companyFileKey,
  type ImageKind,
  type NewStoredFile,
  type ObjectStorage,
  type StoredObject,
} from "@/src/shared-kernel/files";
import { notFound } from "@/src/shared-kernel/domain-error";

const FOLDERS: Record<ImageKind, string> = {
  company_logo: "logo",
  member_photo: "member-photos",
};

/**
 * Logos and photos in storage (CM-115): checks the image, uploads it under the
 * Company's prefix, and undoes the upload when the database write fails.
 */
export class CompanyImages {
  constructor(private readonly storage: ObjectStorage) {}

  /** Uploads a checked image and returns its `stored_files` record. */
  async upload(input: {
    workspaceId: string;
    kind: ImageKind;
    bytes: Uint8Array;
    declaredType: string | null;
    by: string;
    now: Date;
  }): Promise<NewStoredFile> {
    const image = checkImage(input.kind, input.bytes, input.declaredType);
    const key = companyFileKey(
      input.workspaceId,
      FOLDERS[input.kind],
      image.extension,
    );
    await this.storage.put(key, input.bytes, image.contentType);
    return {
      workspaceId: input.workspaceId,
      key,
      kind: input.kind,
      contentType: image.contentType,
      bytes: image.bytes,
      createdBy: input.by,
      createdAt: input.now,
    };
  }

  /**
   * Runs `write` after an upload; deletes the new object if it fails, and
   * the replaced object once it succeeds.
   */
  async commit(
    uploaded: NewStoredFile,
    replacedKey: string | null,
    write: () => Promise<void>,
  ): Promise<void> {
    try {
      await write();
    } catch (error) {
      await this.discard(uploaded.key);
      throw error;
    }
    if (replacedKey != null) await this.discard(replacedKey);
  }

  /** Best effort: a leftover object costs storage, not correctness. */
  async discard(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch (error) {
      console.error(`Could not delete ${key} from storage`, error);
    }
  }

  async read(key: string | null, missing: () => Error): Promise<StoredObject> {
    if (key == null) throw missing();
    const object = await this.storage.get(key);
    if (object == null) throw missing();
    return object;
  }
}

export const logoNotFound = () =>
  notFound("LOGO_NOT_FOUND", "This Company has no logo.");

export const photoNotFound = () =>
  notFound("PHOTO_NOT_FOUND", "You have not added a photo.");
