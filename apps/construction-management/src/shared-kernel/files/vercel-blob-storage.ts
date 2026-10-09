import {
  BlobNotFoundError,
  del,
  get,
  head,
  issueSignedToken,
  put,
} from "@vercel/blob";
import {
  handleUploadPresigned,
  type HandleUploadPresignedBody,
} from "@vercel/blob/client";

import { DomainError } from "../domain-error";
import type {
  DirectUploads,
  ObjectHead,
  ObjectStorage,
  StoredObject,
} from "./object-storage";

/** How long a browser has to start its upload once we allow it. */
export const DIRECT_UPLOAD_VALID_MS = 15 * 60 * 1000;

/**
 * We record uploads ourselves when the browser says it is done, so no
 * Blob callback is ever asked for. `handleUploadPresigned` still insists
 * on a key to check callbacks with, even for the presign step.
 */
const NO_CALLBACKS = "no-upload-callbacks";

function isPresignRequest(body: unknown): body is HandleUploadPresignedBody & {
  type: "blob.generate-presigned-url";
} {
  if (typeof body !== "object" || body == null) return false;
  const { type, payload } = body as { type?: unknown; payload?: unknown };
  if (type !== "blob.generate-presigned-url") return false;
  if (typeof payload !== "object" || payload == null) return false;
  const { pathname, multipart } = payload as {
    pathname?: unknown;
    multipart?: unknown;
  };
  return typeof pathname === "string" && typeof multipart === "boolean";
}

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

  async head(key: string): Promise<ObjectHead | null> {
    try {
      const result = await head(key, this.credentials());
      return { bytes: result.size, contentType: result.contentType };
    } catch (error) {
      if (error instanceof BlobNotFoundError) return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await del(key, this.credentials());
  }

  /**
   * The browser asks for a presigned URL for one pathname; we sign a
   * delegation for exactly that pathname, `put` only, for 15 minutes, no
   * larger than `allow` says, and never over an existing blob. A multipart
   * upload (`/mpu` create, parts, complete) is signed with the same `put`
   * delegation, so it needs no other operation. Upload-completed callbacks
   * are refused: the browser tells our own route when it is done.
   */
  readonly directUploads: DirectUploads = {
    answer: async ({ request, body, allow }) => {
      if (!isPresignRequest(body))
        throw new DomainError(
          "UPLOAD_REQUEST_INVALID",
          "Only a request for an upload URL is accepted here.",
        );
      return handleUploadPresigned({
        body,
        request,
        webhookPublicKey: NO_CALLBACKS,
        getSignedToken: async (pathname) => {
          const { maxBytes } = await allow(pathname);
          const token = await issueSignedToken({
            pathname,
            operations: ["put"],
            maximumSizeInBytes: maxBytes,
            validUntil: Date.now() + DIRECT_UPLOAD_VALID_MS,
            ...this.credentials(),
          });
          return {
            token,
            urlOptions: {
              maximumSizeInBytes: maxBytes,
              allowOverwrite: false,
              addRandomSuffix: false,
            },
          };
        },
      });
    },
  };
}
