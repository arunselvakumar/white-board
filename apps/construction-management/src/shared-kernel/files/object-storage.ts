import { newId } from "../ids";

/** An object read back from storage, streamed. */
export type StoredObject = {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  contentLength: number | null;
};

/** What storage knows about an object without reading it. */
export type ObjectHead = { bytes: number; contentType: string };

/**
 * Lets a browser send one object straight to storage, so a large file
 * never passes through our functions (Vercel caps a request body at
 * 4.5 MB). Only Vercel Blob has it; files on disk go through our routes.
 */
export type DirectUploads = {
  /**
   * Answers the browser's handshake (`uploadPresigned()` from
   * `@vercel/blob/client`; `body` is its JSON). `allow` is asked for the
   * key the browser names and throws unless this caller may write it; it
   * returns the most bytes the object may have. The result is the JSON to
   * send back: a short-lived permission to write that one key, once.
   */
  answer(input: {
    request: Request;
    body: unknown;
    allow: (key: string) => Promise<{ maxBytes: number }>;
  }): Promise<unknown>;
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
  /** Size and stored type, or null when there is no such object. */
  head(key: string): Promise<ObjectHead | null>;
  delete(key: string): Promise<void>;
  /** Present when browsers may upload straight to this storage. */
  readonly directUploads?: DirectUploads | undefined;
};

/**
 * The object's first `count` bytes (fewer when it is shorter), without
 * reading the rest: the stream is cancelled once they have arrived.
 */
export async function firstBytes(
  object: StoredObject,
  count: number,
): Promise<Uint8Array> {
  const reader = object.body.getReader();
  const prefix = new Uint8Array(count);
  let filled = 0;
  try {
    while (filled < count) {
      const { done, value } = await reader.read();
      if (done) break;
      const take = Math.min(value.byteLength, count - filled);
      prefix.set(value.subarray(0, take), filled);
      filled += take;
    }
  } finally {
    await reader.cancel();
  }
  return prefix.slice(0, filled);
}

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
