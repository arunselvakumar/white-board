import { prisma } from "@repo/construction-db";
import { describe, expect, it } from "vitest";

import { newId } from "../ids";
import { createQueueDrain } from "./drain";
import { enqueueJob, prismaQueueStore } from "./prisma-queue-store";
import type { QueueHandler } from "./queue";

const store = prismaQueueStore(prisma);

/** A type no other test enqueues, so drains never meet foreign jobs. */
function uniqueType(): string {
  return `test-${newId()}`;
}

async function statusOf(type: string) {
  return prisma.constructionOrganizationQueueJob.findMany({
    where: { type },
    orderBy: { createdAt: "asc" },
    select: { status: true, attempts: true, lastError: true },
  });
}

describe("the Postgres queue (ADR CM-0021 §1)", () => {
  it("two concurrent claims never take the same job", async () => {
    const type = uniqueType();
    for (let i = 0; i < 6; i += 1)
      await enqueueJob(prisma, { type, workspaceId: null, payload: { i } });
    const types = new Map([[type, 1_000]]);
    const claims = await Promise.all(
      Array.from({ length: 8 }, () => store.claim(types, new Date())),
    );
    const ids = claims.flatMap((job) => (job == null ? [] : [job.id]));
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
  });

  it("reclaims a running job whose lease has passed", async () => {
    const type = uniqueType();
    await enqueueJob(prisma, { type, workspaceId: null, payload: null });
    const types = new Map([[type, 1_000]]);
    const first = await store.claim(types, new Date());
    expect(first?.attempts).toBe(1);
    // Still leased: nothing to claim.
    expect(await store.claim(types, new Date())).toBeNull();
    const later = new Date(Date.now() + 60_000);
    const again = await store.claim(types, later);
    expect(again?.id).toBe(first?.id);
    expect(again?.attempts).toBe(2);
  });

  it("adds one unfinished job per dedupe key and returns its id", async () => {
    const type = uniqueType();
    const key = `dedupe:${newId()}`;
    const a = await enqueueJob(prisma, {
      type,
      workspaceId: null,
      payload: 1,
      dedupeKey: key,
    });
    const b = await enqueueJob(prisma, {
      type,
      workspaceId: null,
      payload: 2,
      dedupeKey: key,
    });
    expect(b).toBe(a);
    expect(await store.hasUnfinished(key)).toBe(true);
    await store.complete(a, new Date());
    expect(await store.hasUnfinished(key)).toBe(false);
    const c = await enqueueJob(prisma, {
      type,
      workspaceId: null,
      payload: 3,
      dedupeKey: key,
    });
    expect(c).not.toBe(a);
  });

  it("enqueues inside a transaction that rolls back: no job", async () => {
    const type = uniqueType();
    await expect(
      prisma.$transaction(async (tx) => {
        await enqueueJob(tx, { type, workspaceId: null, payload: null });
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(await statusOf(type)).toEqual([]);
  });

  it("drains: done, retried with backoff, then failed", async () => {
    const ok = uniqueType();
    const bad = uniqueType();
    const handlers: QueueHandler[] = [
      { type: ok, timeLimitMs: 1_000, run: () => Promise.resolve() },
      {
        type: bad,
        timeLimitMs: 1_000,
        run: () => Promise.reject(new Error("no luck")),
      },
    ];
    await enqueueJob(prisma, { type: ok, workspaceId: null, payload: null });
    await enqueueJob(prisma, {
      type: bad,
      workspaceId: null,
      payload: null,
      maxAttempts: 1,
    });
    const result = await createQueueDrain({ store, handlers }).drain({
      budgetMs: 10_000,
      types: [ok, bad],
    });
    expect(result).toEqual({ ran: 2, failed: 1 });
    expect(await statusOf(ok)).toEqual([
      { status: "done", attempts: 1, lastError: null },
    ]);
    expect(await statusOf(bad)).toEqual([
      { status: "failed", attempts: 1, lastError: "no luck" },
    ]);
  });
});
