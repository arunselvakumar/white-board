import { BlobNotFoundError, del, get, put } from "@vercel/blob";

import type { ObjectStorage, StoredObject } from "./object-storage";

/**
 * `ObjectStorage` on Vercel Blob. Every blob is private and stored at its
 * key exactly (no random suffix); reads go through our routes, so no blob
 * URL ever reaches a browser. Credentials are a static read-write token, or
 * (`token` null) the deployment's OIDC token with `BLOB_STORE_ID`, which is
 * what a Blob store connected to the Vercel project provides.
 */
export class VercelBlobStorage implements ObjectStorage {
  constructor(private readonly token: string | null) {}

  private credentials(): { token?: string } {
    return this.token == null ? {} : { token: this.token };
  }

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
      ...this.credentials(),
    });
  }

  async get(key: string): Promise<StoredObject | null> {
    try {
      const result = await get(key, {
        access: "private",
        ...this.credentials(),
      });
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
    await del(key, this.credentials());
  }
}
