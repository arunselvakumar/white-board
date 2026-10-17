import { describe, expect, it } from "vitest";

import { createQueueDrain } from "./drain";
import {
  retryDelayMs,
  type EnqueueInput,
  type QueueHandler,
  type QueueJob,
  type QueueStore,
} from "./queue";

type Row = QueueJob & {
  status: "queued" | "running" | "done" | "failed";
  runAfter: number;
  leaseUntil: number | null;
  lastError: string | null;
};

function memoryStore(clock: () => Date) {
  const rows: Row[] = [];
  let next = 0;
  const store: QueueStore = {
    enqueue(input: EnqueueInput) {
      next += 1;
      const id = `job-${String(next)}`;
      rows.push({
        id,
        workspaceId: input.workspaceId,
        type: input.type,
        payload: input.payload,
        attempts: 0,
        maxAttempts: input.maxAttempts ?? 3,
        status: "queued",
        runAfter: (input.runAfter ?? clock()).getTime(),
        leaseUntil: null,
        lastError: null,
      });
      return Promise.resolve(id);
    },
    claim(types, now, onlyIds) {
      const at = now.getTime();
      const row = rows.find(
        (r) =>
          types.has(r.type) &&
          (onlyIds == null || onlyIds.includes(r.id)) &&
          ((r.status === "queued" && r.runAfter <= at) ||
            (r.status === "running" && (r.leaseUntil ?? 0) < at)),
      );
      if (row == null) return Promise.resolve(null);
      row.status = "running";
      row.attempts += 1;
      row.leaseUntil = at + (types.get(row.type) ?? 0) + 30_000;
      return Promise.resolve({ ...row });
    },
    complete(id) {
      const row = rows.find((r) => r.id === id);
      if (row != null) row.status = "done";
      return Promise.resolve();
    },
    retry(id, error, runAfter) {
      const row = rows.find((r) => r.id === id);
      if (row != null) {
        row.status = "queued";
        row.runAfter = runAfter.getTime();
        row.lastError = error;
      }
      return Promise.resolve();
    },
    giveUp(id, error) {
      const row = rows.find((r) => r.id === id);
      if (row != null) {
        row.status = "failed";
        row.lastError = error;
      }
      return Promise.resolve();
    },
    hasUnfinished: () => Promise.resolve(false),
  };
  return { store, rows };
}

function fixedClock(start: number) {
  let now = start;
  return {
    clock: () => new Date(now),
    advance(ms: number) {
      now += ms;
    },
  };
}

describe("retryDelayMs", () => {
  it("backs off 30 s, 2 min, then 10 min", () => {
    expect(retryDelayMs(1)).toBe(30_000);
    expect(retryDelayMs(2)).toBe(120_000);
    expect(retryDelayMs(3)).toBe(600_000);
    expect(retryDelayMs(9)).toBe(600_000);
  });
});

describe("createQueueDrain", () => {
  it("runs due jobs and completes them", async () => {
    const time = fixedClock(Date.UTC(2026, 9, 16));
    const { store, rows } = memoryStore(time.clock);
    const seen: unknown[] = [];
    const handler: QueueHandler = {
      type: "echo",
      timeLimitMs: 1_000,
      run: (job) => {
        seen.push(job.payload);
        return Promise.resolve();
      },
    };
    await store.enqueue(
      { type: "echo", workspaceId: "w", payload: 1 },
      time.clock(),
    );
    await store.enqueue(
      { type: "echo", workspaceId: "w", payload: 2 },
      time.clock(),
    );
    const drain = createQueueDrain({
      store,
      handlers: [handler],
      clock: time.clock,
    });

    expect(await drain.drain({ budgetMs: 10_000 })).toEqual({
      ran: 2,
      failed: 0,
    });
    expect(seen).toEqual([1, 2]);
    expect(rows.map((r) => r.status)).toEqual(["done", "done"]);
  });

  it("retries a failing job with backoff, then gives up and calls onGiveUp", async () => {
    const time = fixedClock(Date.UTC(2026, 9, 16));
    const { store, rows } = memoryStore(time.clock);
    const gaveUp: string[] = [];
    const handler: QueueHandler = {
      type: "flaky",
      timeLimitMs: 1_000,
      run: () => Promise.reject(new Error("boom")),
      onGiveUp: (job, error) => {
        gaveUp.push(`${job.id}:${error}`);
        return Promise.resolve();
      },
    };
    await store.enqueue(
      { type: "flaky", workspaceId: null, payload: null, maxAttempts: 2 },
      time.clock(),
    );
    const drain = createQueueDrain({
      store,
      handlers: [handler],
      clock: time.clock,
    });

    await drain.drain({ budgetMs: 10_000 });
    expect(rows[0]?.status).toBe("queued");
    expect(rows[0]?.runAfter).toBe(time.clock().getTime() + 30_000);
    // Not due yet: nothing runs.
    expect(await drain.drain({ budgetMs: 10_000 })).toEqual({
      ran: 0,
      failed: 0,
    });

    time.advance(30_000);
    await drain.drain({ budgetMs: 10_000 });
    expect(rows[0]?.status).toBe("failed");
    expect(gaveUp).toEqual(["job-1:boom"]);
  });

  it("aborts a job past its limit and counts it as a failed attempt", async () => {
    const { store, rows } = memoryStore(() => new Date());
    let aborted = false;
    const handler: QueueHandler = {
      type: "slow",
      timeLimitMs: 20,
      run: (_job, signal) =>
        new Promise((resolve) => {
          signal.addEventListener("abort", () => {
            aborted = true;
            resolve();
          });
        }),
    };
    await store.enqueue(
      { type: "slow", workspaceId: null, payload: null },
      new Date(),
    );
    const drain = createQueueDrain({ store, handlers: [handler] });

    expect(await drain.drain({ budgetMs: 10_000 })).toEqual({
      ran: 1,
      failed: 1,
    });
    expect(aborted).toBe(true);
    expect(rows[0]?.status).toBe("queued");
    expect(rows[0]?.lastError).toMatch(/took longer/);
  });

  it("never claims a job whose limit does not fit in the budget left", async () => {
    const time = fixedClock(Date.UTC(2026, 9, 16));
    const { store, rows } = memoryStore(time.clock);
    const handler: QueueHandler = {
      type: "long",
      timeLimitMs: 240_000,
      run: () => Promise.resolve(),
    };
    await store.enqueue(
      { type: "long", workspaceId: null, payload: null },
      time.clock(),
    );
    const drain = createQueueDrain({
      store,
      handlers: [handler],
      clock: time.clock,
    });

    expect(await drain.drain({ budgetMs: 60_000 })).toEqual({
      ran: 0,
      failed: 0,
    });
    expect(rows[0]?.status).toBe("queued");
    expect(await drain.drain({ budgetMs: 270_000 })).toEqual({
      ran: 1,
      failed: 0,
    });
  });

  it("drains only the given ids", async () => {
    const { store, rows } = memoryStore(() => new Date());
    const handler: QueueHandler = {
      type: "echo",
      timeLimitMs: 1_000,
      run: () => Promise.resolve(),
    };
    await store.enqueue(
      { type: "echo", workspaceId: null, payload: null },
      new Date(),
    );
    const mine = await store.enqueue(
      { type: "echo", workspaceId: null, payload: null },
      new Date(),
    );
    const drain = createQueueDrain({ store, handlers: [handler] });

    await drain.drain({ budgetMs: 10_000, ids: [mine] });
    expect(rows.map((r) => r.status)).toEqual(["queued", "done"]);
  });

  it("gives up on a crashed run reclaimed after its last attempt", async () => {
    const time = fixedClock(Date.UTC(2026, 9, 16));
    const { store, rows } = memoryStore(time.clock);
    const gaveUp: string[] = [];
    const handler: QueueHandler = {
      type: "echo",
      timeLimitMs: 1_000,
      run: () => Promise.resolve(),
      onGiveUp: (job) => {
        gaveUp.push(job.id);
        return Promise.resolve();
      },
    };
    await store.enqueue(
      { type: "echo", workspaceId: null, payload: null, maxAttempts: 1 },
      time.clock(),
    );
    // A run that crashed: claimed, never finished, lease passed.
    await store.claim(new Map([["echo", 1_000]]), time.clock());
    time.advance(60_000);
    const drain = createQueueDrain({
      store,
      handlers: [handler],
      clock: time.clock,
    });

    expect(await drain.drain({ budgetMs: 10_000 })).toEqual({
      ran: 1,
      failed: 1,
    });
    expect(rows[0]?.status).toBe("failed");
    expect(gaveUp).toEqual(["job-1"]);
  });

  it("never retries a job that ran when marking it done fails", async () => {
    const { store, rows } = memoryStore(() => new Date());
    let runs = 0;
    let completes = 0;
    const flaky: QueueStore = {
      ...store,
      complete: (id, now) => {
        completes += 1;
        return completes === 1
          ? Promise.reject(new Error("connection reset"))
          : store.complete(id, now);
      },
    };
    const handler: QueueHandler = {
      type: "echo",
      timeLimitMs: 1_000,
      run: () => {
        runs += 1;
        return Promise.resolve();
      },
    };
    await store.enqueue(
      { type: "echo", workspaceId: null, payload: null },
      new Date(),
    );
    const drain = createQueueDrain({ store: flaky, handlers: [handler] });

    expect(await drain.drain({ budgetMs: 10_000 })).toEqual({
      ran: 1,
      failed: 0,
    });
    expect(runs).toBe(1);
    expect(rows[0]?.status).toBe("done");
  });
});
