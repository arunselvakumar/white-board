import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ObjectHead, ObjectStorage, StoredObject } from "./object-storage";

const SAFE_KEY =
  /^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/**
 * `ObjectStorage` as files on disk, for development and tests (there is no
 * local Vercel Blob emulator). Each object is `<dir>/<key>` with its
 * content type beside it in `<key>.meta.json`. Never used in production.
 */
export class LocalFileStorage implements ObjectStorage {
  constructor(private readonly dir: string) {}

  private pathOf(key: string): string {
    if (!SAFE_KEY.test(key) || key.split("/").includes(".."))
      throw new Error(`Unsafe storage key: ${key}`);
    return path.join(this.dir, key);
  }

  async put(
    key: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<void> {
    const file = this.pathOf(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes);
    await writeFile(`${file}.meta.json`, JSON.stringify({ contentType }));
  }

  async get(key: string): Promise<StoredObject | null> {
    const file = this.pathOf(key);
    try {
      const [bytes, meta] = await Promise.all([
        readFile(file),
        readFile(`${file}.meta.json`, "utf8"),
      ]);
      const { contentType } = JSON.parse(meta) as { contentType: string };
      return {
        body: new Blob([new Uint8Array(bytes)]).stream(),
        contentType,
        contentLength: bytes.byteLength,
      };
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  async head(key: string): Promise<ObjectHead | null> {
    const file = this.pathOf(key);
    try {
      const [info, meta] = await Promise.all([
        stat(file),
        readFile(`${file}.meta.json`, "utf8"),
      ]);
      const { contentType } = JSON.parse(meta) as { contentType: string };
      return { bytes: info.size, contentType };
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    const file = this.pathOf(key);
    await rm(file, { force: true });
    await rm(`${file}.meta.json`, { force: true });
  }
}
