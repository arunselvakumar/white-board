import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { BlobNotFoundError, del, get, put } from "@vercel/blob";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { LocalFileStorage } from "./local-file-storage";
import { storageFromEnv } from "./storage-from-env";
import { VercelBlobStorage } from "./vercel-blob-storage";

vi.mock(import("@vercel/blob"), async (importOriginal) => ({
  ...(await importOriginal()),
  put: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
}));

const KEY = "companies/company-a/logo/0199c3a0-0000-7000-8000-000000000001.png";
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function bytesOf(stream: ReadableStream<Uint8Array>): Promise<number[]> {
  return [...new Uint8Array(await new Response(stream).arrayBuffer())];
}

describe("VercelBlobStorage", () => {
  const storage = new VercelBlobStorage("vercel_blob_rw_test");

  beforeEach(() => {
    vi.mocked(put).mockReset();
    vi.mocked(get).mockReset();
    vi.mocked(del).mockReset();
  });

  it("puts a private blob at the key exactly", async () => {
    await storage.put(KEY, PNG, "image/png");
    expect(put).toHaveBeenCalledWith(KEY, Buffer.from(PNG), {
      access: "private",
      contentType: "image/png",
      addRandomSuffix: false,
      allowOverwrite: true,
      token: "vercel_blob_rw_test",
    });
  });

  it("reads a private blob by its key as a stream", async () => {
    vi.mocked(get).mockResolvedValue({
      statusCode: 200,
      stream: new Blob([PNG]).stream(),
      headers: new Headers(),
      blob: {
        url: "https://store.private.blob.vercel-storage.com/x",
        downloadUrl:
          "https://store.private.blob.vercel-storage.com/x?download=1",
        pathname: KEY,
        contentDisposition: "inline",
        cacheControl: "private",
        uploadedAt: new Date(),
        etag: "etag",
        contentType: "image/png",
        size: PNG.byteLength,
      },
    });
    const object = await storage.get(KEY);
    expect(get).toHaveBeenCalledWith(KEY, {
      access: "private",
      token: "vercel_blob_rw_test",
    });
    expect(object).toMatchObject({
      contentType: "image/png",
      contentLength: PNG.byteLength,
    });
    expect(await bytesOf(object?.body ?? new Blob().stream())).toEqual([
      ...PNG,
    ]);
  });

  it("is null for a missing blob", async () => {
    vi.mocked(get).mockResolvedValueOnce(null);
    await expect(storage.get(KEY)).resolves.toBeNull();
    vi.mocked(get).mockRejectedValueOnce(new BlobNotFoundError());
    await expect(storage.get(KEY)).resolves.toBeNull();
  });

  it("deletes by key with the token", async () => {
    await storage.delete(KEY);
    expect(del).toHaveBeenCalledWith(KEY, { token: "vercel_blob_rw_test" });
  });
});

describe("LocalFileStorage", () => {
  const dirs: string[] = [];

  afterAll(async () => {
    await Promise.all(
      dirs.map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  async function storage() {
    const dir = await mkdtemp(path.join(os.tmpdir(), "construction-blob-"));
    dirs.push(dir);
    return new LocalFileStorage(dir);
  }

  it("stores, reads back and deletes an object with its type", async () => {
    const local = await storage();
    await local.put(KEY, PNG, "image/png");
    const object = await local.get(KEY);
    expect(object).toMatchObject({
      contentType: "image/png",
      contentLength: PNG.byteLength,
    });
    expect(await bytesOf(object?.body ?? new Blob().stream())).toEqual([
      ...PNG,
    ]);
    await local.delete(KEY);
    await expect(local.get(KEY)).resolves.toBeNull();
    await expect(local.delete(KEY)).resolves.toBeUndefined();
  });

  it("refuses keys that would leave its folder", async () => {
    const local = await storage();
    await expect(local.put("../escape.png", PNG, "image/png")).rejects.toThrow(
      "Unsafe storage key",
    );
    await expect(local.get("/etc/passwd")).rejects.toThrow(
      "Unsafe storage key",
    );
  });
});

describe("storageFromEnv", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses Vercel Blob when a token is set", () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_test");
    expect(storageFromEnv()).toBeInstanceOf(VercelBlobStorage);
  });

  it("uses Vercel Blob over OIDC when a store is connected", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    vi.stubEnv("BLOB_STORE_ID", "store_test");
    const storage = storageFromEnv();
    expect(storage).toBeInstanceOf(VercelBlobStorage);
    await storage.delete("companies/c1/logo/a.png");
    // No static token: @vercel/blob uses VERCEL_OIDC_TOKEN with BLOB_STORE_ID.
    expect(del).toHaveBeenLastCalledWith("companies/c1/logo/a.png", {});
  });

  it("uses files on disk without credentials, but never in production", () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    vi.stubEnv("BLOB_STORE_ID", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(storageFromEnv()).toBeInstanceOf(LocalFileStorage);
    vi.stubEnv("NODE_ENV", "production");
    expect(() => storageFromEnv()).toThrow("Connect a Vercel Blob store");
  });
});
