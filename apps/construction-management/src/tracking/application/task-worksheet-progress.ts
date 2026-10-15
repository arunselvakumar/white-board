import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { newId } from "@/src/shared-kernel/ids";

import {
  FULL_PCT,
  parseQuantity,
  percentValue,
  quantityText,
} from "../domain/task-progress";
import type { TrackingTx } from "./ports";
import {
  recomputeTaskAndAncestors,
  type TaskRecomputed,
} from "./task-recompute";
import type { NewActivity, ProgressRow, TaskStore } from "./task-store";

/**
 * Task progress from Daily Worksheets (CM-806, ADR CM-0019 §6), inside the
 * worksheet's transaction: each sheet has at most one live update (source
 * `worksheet`). The composition's `TaskProgressPosting` adapter calls these;
 * site work decides when (units match, not rejected, a leaf task).
 */

export type WorksheetProgressInput = {
  workspaceId: string;
  worksheetId: string;
  worksheetNumber: string;
  taskId: string;
  date: CalendarDate;
  /** Decimal string > 0, in the task's unit. */
  quantity: string;
  by: string;
  at: Date;
};

function crossing(taskId: string, result: TaskRecomputed): NewActivity[] {
  const before = result.before?.pct ?? 0;
  const after = result.after;
  if (after == null) return [];
  if (before < FULL_PCT && after.pct >= FULL_PCT && after.actualEnd != null)
    return [
      { taskId, kind: "completed", payload: { actualEnd: after.actualEnd } },
    ];
  if (before >= FULL_PCT && after.pct < FULL_PCT)
    return [
      {
        taskId,
        kind: "reopened",
        payload: { progressPct: percentValue(after.pct) },
      },
    ];
  return [];
}

async function dropUpdate(
  tx: TrackingTx,
  store: TaskStore,
  row: ProgressRow,
  input: { workspaceId: string; by: string; at: Date },
): Promise<void> {
  await store.tombstoneProgress(tx, row.id, input.by, input.at);
  const result = await recomputeTaskAndAncestors(tx, row.taskId, store);
  await store.addActivities(tx, input.workspaceId, input.by, input.at, [
    {
      taskId: row.taskId,
      kind: "worksheet_progress",
      payload: {
        removed: true,
        worksheetId: row.worksheetId,
        worksheetNumber: row.worksheetNumber,
        progressDate: row.progressDate,
        workQty: row.workMilli == null ? null : quantityText(row.workMilli),
        taskProgressPct: percentValue(result.after?.pct ?? 0),
      },
    },
    ...crossing(row.taskId, result),
  ]);
}

/**
 * Posts (or replaces) a worksheet's update: the same task gets its row
 * changed; another task loses it and the new one gains it. Nothing is
 * written when the update already says this.
 */
export async function postWorksheetProgress(
  tx: TrackingTx,
  store: TaskStore,
  input: WorksheetProgressInput,
): Promise<void> {
  const workMilli = parseQuantity(input.quantity, "approxWorkQty");
  const existing = await store.worksheetProgress(
    tx,
    input.workspaceId,
    input.worksheetId,
  );
  if (
    existing?.taskId === input.taskId &&
    existing.progressDate === input.date &&
    existing.workMilli === workMilli &&
    existing.worksheetNumber === input.worksheetNumber
  )
    return;
  if (existing != null && existing.taskId !== input.taskId)
    await dropUpdate(tx, store, existing, input);
  const values = {
    progressDate: input.date,
    workMilli,
    pct: null,
    remark: null,
    by: input.by,
    at: input.at,
  };
  if (existing?.taskId === input.taskId)
    await store.updateProgress(tx, existing.id, values);
  else
    await store.insertProgress(tx, {
      ...values,
      id: newId(input.at.getTime()),
      workspaceId: input.workspaceId,
      taskId: input.taskId,
      worksheet: { id: input.worksheetId, number: input.worksheetNumber },
    });
  const result = await recomputeTaskAndAncestors(tx, input.taskId, store);
  await store.addActivities(tx, input.workspaceId, input.by, input.at, [
    {
      taskId: input.taskId,
      kind: "worksheet_progress",
      payload: {
        worksheetId: input.worksheetId,
        worksheetNumber: input.worksheetNumber,
        progressDate: input.date,
        workQty: quantityText(workMilli),
        replaced: existing?.taskId === input.taskId,
        taskProgressPct: percentValue(result.after?.pct ?? 0),
      },
    },
    ...crossing(input.taskId, result),
  ]);
}

/** Removes a worksheet's update (sheet deleted, rejected, unlinked …). */
export async function removeWorksheetProgress(
  tx: TrackingTx,
  store: TaskStore,
  input: { workspaceId: string; worksheetId: string; by: string; at: Date },
): Promise<void> {
  const existing = await store.worksheetProgress(
    tx,
    input.workspaceId,
    input.worksheetId,
  );
  if (existing != null) await dropUpdate(tx, store, existing, input);
}
