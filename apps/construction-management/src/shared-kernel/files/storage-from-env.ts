import path from "node:path";

import { LocalFileStorage } from "./local-file-storage";
import type { ObjectStorage } from "./object-storage";
import { VercelBlobStorage } from "./vercel-blob-storage";

function env(name: string): string | null {
  const value = process.env[name]?.trim() ?? "";
  return value.length === 0 ? null : value;
}

/**
 * Vercel Blob when `BLOB_READ_WRITE_TOKEN` (a static token) or
 * `BLOB_STORE_ID` (OIDC, set by connecting the store to the Vercel
 * project) is present; otherwise files on disk under `BLOB_LOCAL_DIR`
 * (default `.blob-local` in the app). Files on disk are refused in
 * production, where a deployment's disk does not last.
 */
export function storageFromEnv(): ObjectStorage {
  const token = env("BLOB_READ_WRITE_TOKEN");
  if (token != null) return new VercelBlobStorage(token);
  if (env("BLOB_STORE_ID") != null) return new VercelBlobStorage(null);
  if (process.env.NODE_ENV === "production")
    throw new Error(
      "Connect a Vercel Blob store (BLOB_STORE_ID) or set BLOB_READ_WRITE_TOKEN to store files in production (CM-115).",
    );
  return new LocalFileStorage(
    path.resolve(env("BLOB_LOCAL_DIR") ?? ".blob-local"),
  );
}

let storage: ObjectStorage | null = null;

function shared(): ObjectStorage {
  storage ??= storageFromEnv();
  return storage;
}

/**
 * The app's storage, chosen on the first call, so routes that never touch
 * a file need no storage configuration.
 */
export function objectStorage(): ObjectStorage {
  return {
    put: (key, bytes, contentType) => shared().put(key, bytes, contentType),
    get: (key) => shared().get(key),
    head: (key) => shared().head(key),
    delete: (key) => shared().delete(key),
    get directUploads() {
      return shared().directUploads;
    },
  };
}
