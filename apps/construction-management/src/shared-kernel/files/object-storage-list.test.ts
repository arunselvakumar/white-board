import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { list } from "@vercel/blob";
import { afterAll, describe, expect, it, vi } from "vitest";

import { LocalFileStorage } from "./local-file-storage";
import { VercelBlobStorage } from "./vercel-blob-storage";

vi.mock(import("@vercel/blob"), async (importOriginal) => ({
  ...(await importOriginal()),
  list: vi.fn(),
}));

const BYTES = Uint8Array.from([1, 2, 3]);

describe("listing stored objects (ADR CM-0021 §3)", () => {
  const dirs: string[] = [];

  afterAll(async () => {
    await Promise.all(
      dirs.map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  it("lists files on disk by prefix in key order, a page at a time, without their meta files", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "cm-list-"));
    dirs.push(dir);
    const storage = new LocalFileStorage(dir);
    for (const key of [
      "companies/b/reports/2.pdf",
      "companies/a/logo/1.png",
      "companies/a/reports/3.xlsx",
      "users/u/export.zip",
    ])
      await storage.put(key, BYTES, "application/octet-stream");

    const all = await storage.list("companies/");
    expect(all.objects.map((object) => object.key)).toEqual([
      "companies/a/logo/1.png",
      "companies/a/reports/3.xlsx",
      "companies/b/reports/2.pdf",
    ]);
    expect(all.cursor).toBeNull();
    expect(all.objects[0]?.bytes).toBe(3);
    expect(all.objects[0]?.uploadedAt).toBeInstanceOf(Date);

    const first = await storage.list("companies/", { limit: 2 });
    expect(first.objects).toHaveLength(2);
    expect(first.cursor).toBe("companies/a/reports/3.xlsx");
    const second = await storage.list("companies/", {
      limit: 2,
      cursor: first.cursor,
    });
    expect(second.objects.map((object) => object.key)).toEqual([
      "companies/b/reports/2.pdf",
    ]);
    expect(second.cursor).toBeNull();

    // A prefix that ends inside a name, and one with nothing under it.
    expect(
      (await storage.list("companies/a/re")).objects.map(
        (object) => object.key,
      ),
    ).toEqual(["companies/a/reports/3.xlsx"]);
    expect(await storage.list("nothing/here/")).toEqual({
      objects: [],
      cursor: null,
    });
  });

  it("lists Vercel Blob by prefix and passes its cursor on", async () => {
    vi.mocked(list).mockResolvedValue({
      blobs: [
        {
          url: "https://store.private.blob.vercel-storage.com/x",
          downloadUrl: "https://store.private.blob.vercel-storage.com/x?d=1",
          pathname: "companies/a/reports/1.pdf",
          size: 42,
          uploadedAt: new Date("2026-10-01T00:00:00Z"),
          etag: "etag",
        },
      ],
      cursor: "next-page",
      hasMore: true,
    });
    const storage = new VercelBlobStorage("vercel_blob_rw_test");
    const page = await storage.list("companies/", {
      cursor: "this-page",
      limit: 500,
    });
    expect(list).toHaveBeenCalledWith({
      prefix: "companies/",
      limit: 500,
      cursor: "this-page",
      token: "vercel_blob_rw_test",
    });
    expect(page).toEqual({
      objects: [
        {
          key: "companies/a/reports/1.pdf",
          bytes: 42,
          uploadedAt: new Date("2026-10-01T00:00:00Z"),
        },
      ],
      cursor: "next-page",
    });

    vi.mocked(list).mockResolvedValue({ blobs: [], hasMore: false });
    expect(await storage.list("companies/")).toEqual({
      objects: [],
      cursor: null,
    });
  });
});
