import { newId } from "../ids";

/** An object read back from storage, streamed. */
export type StoredObject = {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  contentLength: number | null;
};

/**
 * Where a Company's files live: Vercel Blob in deployments, files on disk
 * in development and tests. Objects are private: the app streams them to
 * the Company's own Team Members and never hands out their URLs.
 */
export type ObjectStorage = {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** Null when there is no such object. */
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
};

/**
 * A new key under the Company's prefix:
 * `companies/<workspaceId>/<folder>/<uuid>.<extension>`.
 */
export function companyFileKey(
  workspaceId: string,
  folder: string,
  extension: string,
): string {
  return `companies/${workspaceId}/${folder}/${newId()}.${extension}`;
}

/** The file's own id (the uuid in its key), used to version its URL. */
export function fileVersion(key: string): string {
  const name = key.split("/").at(-1) ?? key;
  return name.replace(/\.[^.]+$/, "");
}
