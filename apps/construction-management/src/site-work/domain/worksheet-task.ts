import { DomainError } from "@/src/shared-kernel/domain-error";

import type { SheetApprovalStatus } from "./shift";

/**
 * A Daily Worksheet's Task (CM-806, ADR CM-0019 §6): the sheet names a
 * live leaf task of its Project, and posts its Approx Work Done as the
 * task's progress when the task has a work quantity in the same unit.
 * Otherwise it is only linked, and the form says why.
 */

/** What the worksheet does with its task. */
export type WorksheetTaskPosting =
  /** Posts Approx Work Done as progress (same unit). */
  | "quantity"
  /** Linked only: the unit differs from the task's. */
  | "linked_unit"
  /** Linked only: the task tracks percent. */
  | "linked_percent"
  /** Linked only: no Approx Work Done on the sheet. */
  | "linked_no_quantity";

export type WorksheetTask = {
  id: string;
  projectId: string;
  leaf: boolean;
  unitId: string | null;
};

export function worksheetTaskPosting(
  task: Pick<WorksheetTask, "unitId">,
  sheet: { approxWorkQty: string | null; approxWorkUnitId: string | null },
): WorksheetTaskPosting {
  if (task.unitId == null) return "linked_percent";
  if (sheet.approxWorkQty == null || sheet.approxWorkUnitId == null)
    return "linked_no_quantity";
  return sheet.approxWorkUnitId === task.unitId ? "quantity" : "linked_unit";
}

/**
 * Whether the sheet's update should stand: it names a leaf task, posts by
 * quantity, and is not rejected (pending and approved sheets count).
 */
export function worksheetPostsProgress(
  task: Pick<WorksheetTask, "leaf" | "unitId"> | null,
  sheet: {
    approxWorkQty: string | null;
    approxWorkUnitId: string | null;
    approvalStatus: SheetApprovalStatus;
  },
): boolean {
  if (task == null || !task.leaf || sheet.approvalStatus === "rejected")
    return false;
  return worksheetTaskPosting(task, sheet) === "quantity";
}

/**
 * A newly named task must be a live leaf task of the sheet's Project: 400
 * `WORKSHEET_TASK_NOT_FOUND` (missing, deleted or another Project's) or
 * `WORKSHEET_TASK_IS_SUMMARY`.
 */
export function assertWorksheetTask(
  task: WorksheetTask | null | undefined,
  projectId: string,
): WorksheetTask {
  if (task?.projectId !== projectId)
    throw new DomainError(
      "WORKSHEET_TASK_NOT_FOUND",
      "Choose a task of this Project.",
      { details: { field: "taskId" } },
    );
  if (!task.leaf)
    throw new DomainError(
      "WORKSHEET_TASK_IS_SUMMARY",
      "This task has sub-tasks; choose one of them.",
      { details: { field: "taskId" } },
    );
  return task;
}
