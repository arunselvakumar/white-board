import { childrenByParent, leavesOf } from "../domain/task";
import {
  dateSpan,
  FULL_PCT,
  leafProgress,
  rollUp,
} from "../domain/task-progress";
import type { TrackingTx } from "./ports";
import type { TaskCached, TaskRow, TaskStore } from "./task-store";

export type TaskRecomputed = {
  /** The task asked about, before and after; null when it is not live. */
  before: TaskCached | null;
  after: TaskCached | null;
};

function cachedOf(row: TaskRow): TaskCached {
  return {
    completedMilli: row.completedMilli,
    pct: row.pct,
    actualStart: row.actualStart,
    actualEnd: row.actualEnd,
  };
}

function same(a: TaskCached, b: TaskCached): boolean {
  return (
    a.completedMilli === b.completedMilli &&
    a.pct === b.pct &&
    a.actualStart === b.actualStart &&
    a.actualEnd === b.actualEnd
  );
}

/**
 * A summary task's cached figures from its leaf tasks (CM-0019 §2, §4):
 * progress weighted by price, else planned days; Actual Start the
 * earliest of theirs; Actual End the latest of theirs once it is at 100 %.
 * Its own completed quantity means nothing across units and stays 0.
 */
export function summaryCached(leaves: readonly TaskRow[]): TaskCached {
  const { pct } = rollUp(
    leaves.map((leaf) => ({
      pct: leaf.pct,
      totalPrice: leaf.totalPrice,
      startDate: leaf.startDate,
      dueDate: leaf.dueDate,
    })),
  );
  const done = (pct ?? 0) >= FULL_PCT;
  const span = dateSpan(
    leaves.map((leaf) => leaf.actualStart),
    leaves.map((leaf) => leaf.actualEnd),
  );
  return {
    completedMilli: 0n,
    pct: pct ?? 0,
    actualStart: span.start,
    actualEnd: done ? span.end : null,
  };
}

/**
 * **Recomputes a task and its ancestors** (CM-0019 §3, §4) inside the
 * caller's transaction, after any change that moves progress: a progress
 * update recorded, edited or deleted (here or from a Daily Worksheet,
 * CM-806), Mark As Completed, a task edited (its quantity, price or dates
 * change the weights), sub-tasks added, copied or deleted. It locks the
 * task and its ancestors (shallowest first), then rewrites the cached
 * `completed_work_qty`, `progress_pct`, `actual_start` and `actual_end`:
 * a leaf's from its live updates, a summary's from its live leaf tasks.
 * `updated_at` is left alone, so it never makes an open form stale.
 *
 * Pass a task that is not live (just deleted) and nothing happens: call
 * it with the deleted task's parent instead.
 */
export async function recomputeTaskAndAncestors(
  tx: TrackingTx,
  taskId: string,
  store: TaskStore,
): Promise<TaskRecomputed> {
  const chain = await store.chain(tx, taskId);
  const first = chain[0];
  if (first == null) return { before: null, after: null };
  const locked = await store.lock(
    tx,
    first.workspaceId,
    chain.map((row) => row.id),
  );
  const fresh = new Map(locked.map((row) => [row.id, row]));
  let before: TaskCached | null = null;
  let after: TaskCached | null = null;
  for (const node of chain) {
    const current = fresh.get(node.id) ?? node;
    const below = await store.descendants(tx, node.id);
    let next: TaskCached;
    if (below.length === 0) {
      const updates = await store.progress(tx, node.id);
      next = leafProgress(
        current,
        updates.map((update) => ({
          progressDate: update.progressDate,
          createdAt: update.createdAt,
          workMilli: update.workMilli,
          pct: update.pct,
        })),
      );
    } else {
      const children = childrenByParent(below);
      next = summaryCached(leavesOf(children, current));
    }
    const was = cachedOf(current);
    if (!same(was, next)) await store.setCached(tx, node.id, next);
    if (node.id === first.id) {
      before = was;
      after = next;
    }
  }
  return { before, after };
}
