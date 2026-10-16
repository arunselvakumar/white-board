import {
  queueErrorMessage,
  QueueJobTimedOut,
  retryDelayMs,
  type QueueHandler,
  type QueueJob,
  type QueueStore,
} from "./queue";

type Clock = () => Date;

export type DrainResult = { ran: number; failed: number };

/**
 * Runs due jobs one after another until none is due or the budget is
 * spent (ADR CM-0021 §1). A job is claimed only when its handler's limit
 * fits in what is left of the budget, so a drain never overruns its
 * function's time. A handler past its limit is aborted and counted as a
 * failed attempt.
 */
export function createQueueDrain(deps: {
  store: QueueStore;
  handlers: readonly QueueHandler[];
  clock?: Clock;
}) {
  const clock = deps.clock ?? (() => new Date());
  const byType = new Map(deps.handlers.map((h) => [h.type, h]));

  async function runOne(handler: QueueHandler, job: QueueJob): Promise<void> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        // Settle the race first: an aborted handler may resolve at once.
        reject(new QueueJobTimedOut(handler.timeLimitMs));
        controller.abort();
      }, handler.timeLimitMs);
    });
    try {
      await Promise.race([handler.run(job, controller.signal), timedOut]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function fail(
    handler: QueueHandler,
    job: QueueJob,
    error: unknown,
  ): Promise<void> {
    const message = queueErrorMessage(error);
    console.error(`Queue job ${job.type} ${job.id} failed`, error);
    if (job.attempts < job.maxAttempts) {
      const runAfter = new Date(clock().getTime() + retryDelayMs(job.attempts));
      await deps.store.retry(job.id, message, runAfter);
      return;
    }
    await deps.store.giveUp(job.id, message, clock());
    await handler.onGiveUp?.(job, message);
  }

  return {
    /**
     * Drains until nothing is due or `budgetMs` is spent. `types` limits
     * the drain to some handlers.
     */
    async drain(options: {
      budgetMs: number;
      types?: readonly string[];
      /** Only these jobs: a test's request drains its own job alone. */
      ids?: readonly string[];
    }): Promise<DrainResult> {
      const deadline = clock().getTime() + options.budgetMs;
      const result: DrainResult = { ran: 0, failed: 0 };
      for (;;) {
        const left = deadline - clock().getTime();
        const fitting = new Map<string, number>();
        for (const handler of deps.handlers) {
          if (options.types != null && !options.types.includes(handler.type))
            continue;
          if (handler.timeLimitMs <= left)
            fitting.set(handler.type, handler.timeLimitMs);
        }
        if (fitting.size === 0) return result;
        const job = await deps.store.claim(fitting, clock(), options.ids);
        if (job == null) return result;
        const handler = byType.get(job.type);
        if (handler == null) {
          await deps.store.giveUp(
            job.id,
            "No handler for this job type.",
            clock(),
          );
          continue;
        }
        result.ran += 1;
        // A crashed run reclaimed after its last attempt: give up now.
        if (job.attempts > job.maxAttempts) {
          result.failed += 1;
          await deps.store.giveUp(
            job.id,
            "The job stopped and was not retried.",
            clock(),
          );
          await handler.onGiveUp?.(job, "The job stopped and was not retried.");
          continue;
        }
        try {
          await runOne(handler, job);
          await deps.store.complete(job.id, clock());
        } catch (error) {
          result.failed += 1;
          await fail(handler, job, error);
        }
      }
    },
  };
}

export type QueueDrain = ReturnType<typeof createQueueDrain>;
