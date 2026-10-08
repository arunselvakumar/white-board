import path from "node:path";

import { LocalFileStorage } from "./local-file-storage";
import type { ObjectStorage } from "./object-storage";
import { VercelBlobStorage } from "./vercel-blob-storage";

function env(name: string): string | null {
  const value = process.env[name]?.trim() ?? "";
  return value.length === 0 ? null : value;
}

/**
 * Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set; otherwise files on disk
 * under `BLOB_LOCAL_DIR` (default `.blob-local` in the app). Files on disk
 * are refused in production, where a deployment's disk does not last.
 */
export function storageFromEnv(): ObjectStorage {
  const token = env("BLOB_READ_WRITE_TOKEN");
  if (token != null) return new VercelBlobStorage(token);
  if (process.env.NODE_ENV === "production")
    throw new Error(
      "BLOB_READ_WRITE_TOKEN is required in production to store files (CM-115).",
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
    delete: (key) => shared().delete(key),
  };
}
