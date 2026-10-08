import { BlobNotFoundError, del, get, put } from "@vercel/blob";

import type { ObjectStorage, StoredObject } from "./object-storage";

/**
 * `ObjectStorage` on Vercel Blob. Every blob is private and stored at its
 * key exactly (no random suffix); reads go through our routes with the
 * store's read-write token, so no blob URL ever reaches a browser.
 */
export class VercelBlobStorage implements ObjectStorage {
  constructor(private readonly token: string) {}

  async put(
    key: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<void> {
    await put(key, Buffer.from(bytes), {
      access: "private",
      contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
      token: this.token,
    });
  }

  async get(key: string): Promise<StoredObject | null> {
    try {
      const result = await get(key, { access: "private", token: this.token });
      if (result?.statusCode !== 200) return null;
      return {
        body: result.stream,
        contentType: result.blob.contentType,
        contentLength: result.blob.size,
      };
    } catch (error) {
      if (error instanceof BlobNotFoundError) return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await del(key, { token: this.token });
  }
}
