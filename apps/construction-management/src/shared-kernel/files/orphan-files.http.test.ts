import { mkdtemp, rm, utimes } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { prisma } from "@repo/construction-db";
import { afterAll, describe, expect, it } from "vitest";

import { newId } from "../ids";
import { LocalFileStorage } from "./local-file-storage";
import { deleteOrphanFiles, orphanFilesHandler } from "./orphan-files";
import { recordStoredFile, markStoredFileDeleted } from "./stored-files";

const DAY_MS = 86_400_000;
const BYTES = Uint8Array.from([1, 2, 3, 4]);

describe("the orphan file clean-up (ADR CM-0021 §3)", () => {
  const dirs: string[] = [];

  afterAll(async () => {
    await Promise.all(
      dirs.map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  /** Local disk storage of its own, and a way to age an object. */
  async function disk() {
    const dir = await mkdtemp(path.join(os.tmpdir(), "cm-orphans-"));
    dirs.push(dir);
    const storage = new LocalFileStorage(dir);
    const age = async (key: string, days: number) => {
      const at = new Date(Date.now() - days * DAY_MS);
      await utimes(path.join(dir, key), at, at);
    };
    return { storage, age };
  }

  async function record(workspaceId: string, key: string) {
    await recordStoredFile(prisma, {
      workspaceId,
      key,
      kind: "test",
      contentType: "application/octet-stream",
      bytes: BYTES.byteLength,
      createdBy: "test",
    });
  }

  it("deletes objects over a day old with no live stored_files row, and keeps the rest", async () => {
    const { storage, age } = await disk();
    const ws = newId();
    const live = `companies/${ws}/reports/${newId()}.pdf`;
    const abandoned = `companies/${ws}/uploads/${newId()}.png`;
    const fresh = `companies/${ws}/uploads/${newId()}.png`;
    const replaced = `companies/${ws}/logo/${newId()}.png`;
    const outside = `users/${newId()}/export.zip`;
    for (const key of [live, abandoned, fresh, replaced, outside])
      await storage.put(key, BYTES, "application/octet-stream");
    for (const key of [live, abandoned, replaced, outside]) await age(key, 2);
    await record(ws, live);
    await record(ws, replaced);
    await markStoredFileDeleted(prisma, ws, replaced);

    const result = await deleteOrphanFiles({
      db: prisma,
      storage,
      now: new Date(),
    });
    expect([...result.deleted].sort()).toEqual([abandoned, replaced].sort());
    expect(result.scanned).toBe(4);
    expect(await storage.head(abandoned)).toBeNull();
    expect(await storage.head(replaced)).toBeNull();
    for (const key of [live, fresh, outside])
      expect(await storage.head(key), key).not.toBeNull();
  });

  it("deletes at most the cap per run, and the handler runs it", async () => {
    const { storage, age } = await disk();
    const ws = newId();
    const keys = Array.from(
      { length: 3 },
      () => `companies/${ws}/uploads/${newId()}.png`,
    );
    for (const key of keys) {
      await storage.put(key, BYTES, "application/octet-stream");
      await age(key, 3);
    }
    const capped = await deleteOrphanFiles({
      db: prisma,
      storage,
      now: new Date(),
      cap: 2,
    });
    expect(capped.deleted).toHaveLength(2);
    const handler = orphanFilesHandler({ db: prisma, storage });
    expect(handler.type).toBe("files.orphans");
    await handler.run(
      {
        id: newId(),
        workspaceId: null,
        type: handler.type,
        payload: null,
        attempts: 1,
        maxAttempts: 3,
      },
      new AbortController().signal,
    );
    expect((await storage.list("companies/")).objects).toEqual([]);
  });
});
