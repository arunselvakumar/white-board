import {
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import type {
  ListedObject,
  ObjectHead,
  ObjectListing,
  ObjectStorage,
  StoredObject,
} from "./object-storage";

const META = ".meta.json";

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

  /**
   * Every object under the folder of `prefix` whose key starts with it,
   * in key order (as Blob lists), its modified time as its upload time.
   * The cursor is the last key of the page.
   */
  async list(
    prefix: string,
    options: { cursor?: string | null; limit?: number } = {},
  ): Promise<ObjectListing> {
    const limit = options.limit ?? 1000;
    const folder = prefix.includes("/")
      ? prefix.slice(0, prefix.lastIndexOf("/"))
      : "";
    const keys = (await this.keysUnder(folder))
      .filter(
        (key) =>
          key.startsWith(prefix) &&
          (options.cursor == null || key > options.cursor),
      )
      .sort();
    const page = keys.slice(0, limit);
    const objects: ListedObject[] = [];
    for (const key of page) {
      const info = await stat(path.join(this.dir, key));
      objects.push({ key, bytes: info.size, uploadedAt: info.mtime });
    }
    return {
      objects,
      cursor: keys.length > limit ? (page.at(-1) ?? null) : null,
    };
  }

  /** Object keys below `folder` (relative to the storage root), meta files left out. */
  private async keysUnder(folder: string): Promise<string[]> {
    const root = path.join(this.dir, folder);
    let entries;
    try {
      entries = await readdir(root, { recursive: true, withFileTypes: true });
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
    return entries
      .filter((entry) => entry.isFile() && !entry.name.endsWith(META))
      .map((entry) =>
        path
          .relative(this.dir, path.join(entry.parentPath, entry.name))
          .split(path.sep)
          .join("/"),
      );
  }
}
