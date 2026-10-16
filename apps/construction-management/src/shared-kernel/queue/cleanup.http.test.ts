import { prisma } from "@repo/construction-db";
import { describe, expect, it } from "vitest";

import { newId } from "../ids";
import { deleteFinishedQueueJobs, queueCleanupHandler } from "./cleanup";

const DAY_MS = 86_400_000;

describe("the queue clean-up (ADR CM-0021 §3)", () => {
  it("deletes rows that finished more than 14 days ago, never unfinished ones", async () => {
    const type = `test-cleanup-${newId()}`;
    const now = new Date();
    const ago = (days: number) => new Date(now.getTime() - days * DAY_MS);
    const row = async (
      status: "queued" | "running" | "done" | "failed",
      finishedDaysAgo: number | null,
    ) => {
      const id = newId();
      await prisma.constructionOrganizationQueueJob.create({
        data: {
          id,
          type,
          payload: {},
          status,
          createdAt: ago(30),
          finishedAt: finishedDaysAgo == null ? null : ago(finishedDaysAgo),
        },
      });
      return id;
    };
    const doneOld = await row("done", 15);
    const failedOld = await row("failed", 20);
    const doneRecent = await row("done", 13);
    const queuedOld = await row("queued", null);
    const runningOld = await row("running", null);

    expect(await deleteFinishedQueueJobs(prisma, now)).toBeGreaterThanOrEqual(
      2,
    );
    const left = await prisma.constructionOrganizationQueueJob.findMany({
      where: { type },
      select: { id: true },
    });
    expect(left.map((item) => item.id).sort()).toEqual(
      [doneRecent, queuedOld, runningOld].sort(),
    );
    expect(left.map((item) => item.id)).not.toContain(doneOld);
    expect(left.map((item) => item.id)).not.toContain(failedOld);

    // Through its handler, a day later the 13-day-old row goes too.
    await queueCleanupHandler(
      prisma,
      () => new Date(now.getTime() + 2 * DAY_MS),
    ).run(
      {
        id: newId(),
        workspaceId: null,
        type: "queue.cleanup",
        payload: null,
        attempts: 1,
        maxAttempts: 3,
      },
      new AbortController().signal,
    );
    expect(
      await prisma.constructionOrganizationQueueJob.count({
        where: { id: doneRecent },
      }),
    ).toBe(0);
  });
});
