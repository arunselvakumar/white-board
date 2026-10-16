import {
  Unzip,
  UnzipInflate,
  Zip,
  ZipDeflate,
  ZipPassThrough,
  type UnzipFile,
} from "fflate";

import type { StoredObject } from "@/src/shared-kernel/files";

import type {
  BackupArchive,
  BackupArchiver,
} from "../application/backup-ports";
import { backupTooLarge } from "../domain/backup-job";

type Entry = { push(data: Uint8Array, final: boolean): void };

/**
 * A ZIP written with `fflate`'s streaming `Zip` (ADR CM-0021 §8): text is
 * deflated, media stored as it is (photos and PDFs are compressed
 * already). Chunks are counted as they come out, so a backup over its
 * limit fails as soon as it passes it, not after it is all built.
 */
class FflateArchive implements BackupArchive {
  private readonly chunks: Uint8Array[] = [];
  private size = 0;
  private error: Error | null = null;
  private readonly zip: Zip;

  constructor(private readonly maxBytes: number) {
    this.zip = new Zip((error, chunk) => {
      if (error != null) {
        this.error = error;
        return;
      }
      this.chunks.push(chunk);
      this.size += chunk.byteLength;
    });
  }

  get bytes(): number {
    return this.size;
  }

  private check(): void {
    if (this.error != null) throw this.error;
    if (this.size > this.maxBytes) throw backupTooLarge();
  }

  /** An entry whose data arrives in chunks. */
  entry(path: string, compress: boolean): Entry {
    const file = compress
      ? new ZipDeflate(path, { level: 6 })
      : new ZipPassThrough(path);
    this.zip.add(file);
    return {
      push: (data, final) => {
        file.push(data, final);
        this.check();
      },
    };
  }

  add(path: string, data: Uint8Array, compress: boolean): void {
    this.entry(path, compress).push(data, true);
  }

  finish(): Uint8Array {
    this.zip.end();
    this.check();
    const out = new Uint8Array(this.size);
    let at = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, at);
      at += chunk.byteLength;
    }
    return out;
  }
}

/** Copies a stored ZIP's entries into `into`, reading the object as a stream. */
async function copyEntries(
  part: StoredObject,
  into: BackupArchive,
): Promise<number> {
  if (!(into instanceof FflateArchive))
    throw new Error("Entries can only be copied into an fflate archive.");
  let copied = 0;
  const state: { failure: Error | null } = { failure: null };
  const unzip = new Unzip((file: UnzipFile) => {
    // Stored entries stay stored (media); deflated ones are deflated again.
    const out = into.entry(file.name, file.compression !== 0);
    file.ondata = (error, data, final) => {
      if (state.failure != null) return;
      if (error != null) {
        state.failure = error;
        return;
      }
      try {
        out.push(data, final);
        if (final) copied += 1;
      } catch (pushError) {
        state.failure =
          pushError instanceof Error ? pushError : new Error(String(pushError));
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  const reader = part.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      unzip.push(value, false);
      if (state.failure != null) throw state.failure;
    }
    unzip.push(new Uint8Array(0), true);
    if (state.failure != null) throw state.failure;
  } finally {
    reader.releaseLock();
  }
  return copied;
}

export const fflateArchiver: BackupArchiver = {
  create: (maxBytes) => new FflateArchive(maxBytes),
  copyEntries,
};
