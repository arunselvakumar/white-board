import {
  assertCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { DomainError, conflict } from "@/src/shared-kernel/domain-error";

import {
  isTrackingPriority,
  type TrackingPriority,
} from "./tracking-documents";
import { parsePercent, parseQuantity } from "./task-progress";

/**
 * Tasks (ADR CM-0019 §2–§5, CM-802): the fields a task takes, its place in
 * the three-level tree, and who sees it. Progress arithmetic lives in
 * `task-progress.ts`.
 */

/** A task, its sub-tasks, and theirs (CM-0019 §2). */
export const TASK_MAX_DEPTH = 3;

export const TASK_LIMITS = {
  name: 200,
  description: 4000,
  assignees: 50,
  tags: 30,
  extraLocations: 20,
  reason: 500,
  remark: 1000,
  /** ₹100 crore in paise. */
  totalPrice: 10_000_000_000n,
  bulk: 500,
} as const;

/** Task No. as shown: `T-12` (CM-0019 §2). */
export function taskNoLabel(taskNo: number): string {
  return `T-${String(taskNo)}`;
}

/** What a task form sends, before it is checked. */
export type TaskInput = {
  name: string;
  description?: string | null;
  assigneeIds?: readonly string[] | null;
  startDate?: string | null;
  dueDate?: string | null;
  priority?: string | null;
  departmentId?: string | null;
  contractorId?: string | null;
  tagIds?: readonly string[] | null;
  /** "Total work": a quantity above 0, with its unit. */
  totalWorkQty?: string | number | null;
  totalWorkUnitId?: string | null;
  /** "Total Price" in paise. */
  totalPrice?: number | string | bigint | null;
};

/** The checked fields a task stores (locations are checked by the resolver). */
export type TaskFields = {
  name: string;
  description: string | null;
  assigneeIds: string[];
  startDate: CalendarDate | null;
  dueDate: CalendarDate | null;
  priority: TrackingPriority | null;
  departmentId: string | null;
  contractorId: string | null;
  tagIds: string[];
  totalWorkMilli: bigint | null;
  totalWorkUnitId: string | null;
  totalPrice: bigint | null;
};

function invalid(code: string, message: string, field: string): DomainError {
  return new DomainError(code, message, { details: { field } });
}

function text(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

function ids(values: readonly string[] | null | undefined): string[] {
  return [
    ...new Set(
      (values ?? [])
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value !== ""),
    ),
  ];
}

function date(value: string | null | undefined, field: string) {
  const raw = text(value);
  if (raw == null) return null;
  try {
    return assertCalendarDate(raw);
  } catch {
    throw invalid("DATE_INVALID", "Enter the date as YYYY-MM-DD.", field);
  }
}

/** Paise from a number, digit string or bigint; null when empty. */
export function pricePaise(
  value: number | string | bigint | null | undefined,
  field = "totalPrice",
): bigint | null {
  if (value == null || value === "") return null;
  let paise: bigint;
  try {
    paise = BigInt(value);
  } catch {
    throw invalid(
      "TASK_PRICE_INVALID",
      "Enter the Total Price in rupees.",
      field,
    );
  }
  if (paise < 0n || paise > TASK_LIMITS.totalPrice)
    throw invalid(
      "TASK_PRICE_INVALID",
      "The Total Price must be from ₹0 to ₹100 crore.",
      field,
    );
  return paise;
}

/**
 * Checks a task's own fields (CM-0019 §5): a name; Due on or after Start;
 * a known priority; a unit with a quantity and a quantity with a unit;
 * Total Price in paise. Ids are trimmed and de-duplicated; whether they
 * are the Company's is the directory's check.
 */
export function taskFields(input: TaskInput): TaskFields {
  const name = text(input.name);
  if (name == null)
    throw invalid("TASK_NAME_REQUIRED", "Enter the task's name.", "name");
  if (name.length > TASK_LIMITS.name)
    throw invalid(
      "TASK_NAME_TOO_LONG",
      `Keep the name to ${String(TASK_LIMITS.name)} characters.`,
      "name",
    );
  const description = text(input.description);
  if (description != null && description.length > TASK_LIMITS.description)
    throw invalid(
      "TASK_DESCRIPTION_TOO_LONG",
      `Keep the description to ${String(TASK_LIMITS.description)} characters.`,
      "description",
    );
  const startDate = date(input.startDate, "startDate");
  const dueDate = date(input.dueDate, "dueDate");
  if (startDate != null && dueDate != null && dueDate < startDate)
    throw invalid(
      "TASK_DUE_BEFORE_START",
      "The Due Date cannot be before the Start Date.",
      "dueDate",
    );
  const priorityText = text(input.priority);
  if (priorityText != null && !isTrackingPriority(priorityText))
    throw invalid(
      "PRIORITY_INVALID",
      "Choose High, Medium or Low.",
      "priority",
    );
  const qtyRaw =
    input.totalWorkQty == null || String(input.totalWorkQty).trim() === ""
      ? null
      : input.totalWorkQty;
  const unit = text(input.totalWorkUnitId)?.toLowerCase() ?? null;
  const totalWorkMilli =
    qtyRaw == null
      ? null
      : parseQuantity(qtyRaw, "totalWorkQty", "TASK_WORK_QTY_INVALID");
  if (totalWorkMilli != null && unit == null)
    throw invalid(
      "TASK_UNIT_REQUIRED",
      "Choose the unit of the total work.",
      "totalWorkUnitId",
    );
  if (totalWorkMilli == null && unit != null)
    throw invalid(
      "TASK_WORK_QTY_REQUIRED",
      "Enter the total work in this unit, or clear the unit.",
      "totalWorkQty",
    );
  const assigneeIds = ids(input.assigneeIds);
  if (assigneeIds.length > TASK_LIMITS.assignees)
    throw invalid(
      "TASK_TOO_MANY_ASSIGNEES",
      `Assign at most ${String(TASK_LIMITS.assignees)} Team Members.`,
      "assigneeIds",
    );
  const tagIds = ids(input.tagIds);
  if (tagIds.length > TASK_LIMITS.tags)
    throw invalid(
      "TASK_TOO_MANY_TAGS",
      `Choose at most ${String(TASK_LIMITS.tags)} tags.`,
      "tagIds",
    );
  return {
    name,
    description,
    assigneeIds,
    startDate,
    dueDate,
    priority: priorityText,
    departmentId: text(input.departmentId)?.toLowerCase() ?? null,
    contractorId: text(input.contractorId)?.toLowerCase() ?? null,
    tagIds,
    totalWorkMilli,
    totalWorkUnitId: totalWorkMilli == null ? null : unit,
    totalPrice: pricePaise(input.totalPrice),
  };
}

/** The depth of a new sub-task under `parentDepth`; 400 `TASK_TOO_DEEP` past three levels. */
export function childDepth(parentDepth: number): number {
  const depth = parentDepth + 1;
  if (depth > TASK_MAX_DEPTH)
    throw new DomainError(
      "TASK_TOO_DEEP",
      "A task can have sub-tasks, and they can have theirs, but no deeper.",
      { details: { field: "parentId" } },
    );
  return depth;
}

/**
 * Changing how a task takes progress (quantity ↔ percent) or its unit
 * would mix figures, so it is refused once the task has progress.
 */
export function assertKindKept(
  current: { totalWorkUnitId: string | null },
  next: { totalWorkUnitId: string | null },
  progressCount: number,
): void {
  if (progressCount === 0) return;
  if (current.totalWorkUnitId !== next.totalWorkUnitId)
    throw conflict(
      "TASK_HAS_PROGRESS",
      current.totalWorkUnitId == null || next.totalWorkUnitId == null
        ? "This task has progress updates, so it cannot switch between quantity and percent. Delete its updates first."
        : "This task has progress updates in its unit, so the unit cannot change. Delete its updates first.",
      { field: "totalWorkUnitId" },
    );
}

// ---------------------------------------------------------------------------
// Progress updates (CM-0019 §3, §4)
// ---------------------------------------------------------------------------

export type ProgressInput = {
  progressDate: string;
  /** Quantity tasks: work done in this update. */
  workQty?: string | number | null;
  /** Percent tasks: the new percentage. */
  progressPct?: string | number | null;
  remark?: string | null;
};

export type ProgressFields = {
  progressDate: CalendarDate;
  workMilli: bigint | null;
  pct: number | null;
  remark: string | null;
};

/**
 * Checks an update for a leaf task: not dated after the Company's today;
 * an increment above 0 for a quantity task, a percentage for a percent
 * task.
 */
export function progressFields(
  task: { totalWorkMilli: bigint | null },
  input: ProgressInput,
  today: CalendarDate,
): ProgressFields {
  const progressDate = date(input.progressDate, "progressDate");
  if (progressDate == null)
    throw invalid(
      "PROGRESS_DATE_REQUIRED",
      "Enter the date of this progress.",
      "progressDate",
    );
  if (progressDate > today)
    throw invalid(
      "PROGRESS_DATE_IN_FUTURE",
      "Progress cannot be dated after today.",
      "progressDate",
    );
  const remark = text(input.remark);
  if (remark != null && remark.length > TASK_LIMITS.remark)
    throw invalid(
      "PROGRESS_REMARK_TOO_LONG",
      `Keep the remark to ${String(TASK_LIMITS.remark)} characters.`,
      "remark",
    );
  if (task.totalWorkMilli != null) {
    const raw = input.workQty;
    if (raw == null || String(raw).trim() === "")
      throw invalid(
        "PROGRESS_WORK_QTY_REQUIRED",
        "Enter the work done in this update.",
        "workQty",
      );
    return {
      progressDate,
      workMilli: parseQuantity(raw, "workQty", "PROGRESS_WORK_QTY_INVALID"),
      pct: null,
      remark,
    };
  }
  const raw = input.progressPct;
  if (raw == null || String(raw).trim() === "")
    throw invalid(
      "PROGRESS_PERCENT_REQUIRED",
      "Enter the progress as a percentage.",
      "progressPct",
    );
  return { progressDate, workMilli: null, pct: parsePercent(raw), remark };
}

/** A Re-baseline reason (CM-0019 §3). */
export function rebaselineReason(raw: string | null | undefined): string {
  const reason = text(raw);
  if (reason == null)
    throw invalid(
      "REBASELINE_REASON_REQUIRED",
      "Say why the baseline changes.",
      "reason",
    );
  if (reason.length > TASK_LIMITS.reason)
    throw invalid(
      "REBASELINE_REASON_TOO_LONG",
      `Keep the reason to ${String(TASK_LIMITS.reason)} characters.`,
      "reason",
    );
  return reason;
}

// ---------------------------------------------------------------------------
// The tree
// ---------------------------------------------------------------------------

/** The least a tree walk needs of a task. */
export type TreeNode = {
  id: string;
  parentId: string | null;
  sortOrder: number;
  taskNo: number;
};

/** Children by parent id (`null` = the top level), each list in sort order. */
export function childrenByParent<T extends TreeNode>(
  nodes: readonly T[],
): Map<string | null, T[]> {
  const map = new Map<string | null, T[]>();
  for (const node of nodes) {
    const list = map.get(node.parentId);
    if (list == null) map.set(node.parentId, [node]);
    else list.push(node);
  }
  for (const list of map.values())
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.taskNo - b.taskNo);
  return map;
}

/** The task's sub-tasks and theirs, parents before children. */
export function descendantsOf<T extends TreeNode>(
  children: ReadonlyMap<string | null, readonly T[]>,
  id: string,
): T[] {
  const out: T[] = [];
  const walk = (parentId: string) => {
    for (const child of children.get(parentId) ?? []) {
      out.push(child);
      walk(child.id);
    }
  };
  walk(id);
  return out;
}

/** The leaf tasks under a task (itself when it is a leaf). */
export function leavesOf<T extends TreeNode>(
  children: ReadonlyMap<string | null, readonly T[]>,
  node: T,
): T[] {
  const below = children.get(node.id) ?? [];
  if (below.length === 0) return [node];
  return below.flatMap((child) => leavesOf(children, child));
}

/** Parent, grandparent … of a task, nearest first. */
export function ancestorsOf<T extends TreeNode>(
  byId: ReadonlyMap<string, T>,
  node: T,
): T[] {
  const out: T[] = [];
  let parentId = node.parentId;
  while (parentId != null) {
    const parent = byId.get(parentId);
    if (parent == null) break;
    out.push(parent);
    parentId = parent.parentId;
  }
  return out;
}

/** Depth-first, siblings in sort order: the order the list and the Gantt show. */
export function treeOrder<T extends TreeNode>(nodes: readonly T[]): T[] {
  const children = childrenByParent(nodes);
  const ids = new Set(nodes.map((node) => node.id));
  const roots = nodes.filter(
    (node) => node.parentId == null || !ids.has(node.parentId),
  );
  roots.sort((a, b) => a.sortOrder - b.sortOrder || a.taskNo - b.taskNo);
  const out: T[] = [];
  const walk = (node: T) => {
    out.push(node);
    for (const child of children.get(node.id) ?? []) walk(child);
  };
  for (const root of roots) walk(root);
  return out;
}

// ---------------------------------------------------------------------------
// Visibility (CM-0019 §5)
// ---------------------------------------------------------------------------

/** Who is looking, for View-all scoping. */
export type TaskViewer = {
  /** Sees every task (the Owner, or Task View all). */
  viewAll: boolean;
  userId: string;
  /** Their Team Member id; "assigned to me" compares these. */
  memberId: string | null;
};

/**
 * Without View all a member sees the tasks they created or are assigned
 * to (`own`), and the ancestors of those as context only (`context`:
 * shown greyed, not actionable). With View all every task is `own`.
 */
export function taskVisibility(
  nodes: readonly (TreeNode & {
    createdBy: string;
    assigneeIds: readonly string[];
  })[],
  viewer: TaskViewer,
): { own: Set<string>; context: Set<string> } {
  if (viewer.viewAll)
    return { own: new Set(nodes.map((node) => node.id)), context: new Set() };
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const own = new Set<string>();
  for (const node of nodes)
    if (
      node.createdBy === viewer.userId ||
      (viewer.memberId != null && node.assigneeIds.includes(viewer.memberId))
    )
      own.add(node.id);
  const context = new Set<string>();
  for (const id of own) {
    const node = byId.get(id);
    if (node == null) continue;
    for (const ancestor of ancestorsOf(byId, node))
      if (!own.has(ancestor.id)) context.add(ancestor.id);
  }
  return { own, context };
}

/** Task fields a change names in the activity feed (`edited`). */
export const TASK_FIELD_LABELS = {
  name: "Name",
  description: "Description",
  startDate: "Start Date",
  dueDate: "Due Date",
  priority: "Priority",
  siteLocation: "Location",
  extraLocations: "Other locations",
  departmentId: "Department",
  contractorId: "Contractor",
  tagIds: "Tags",
  totalWork: "Total work",
  totalPrice: "Total Price",
} as const;
export type TaskChangedField = keyof typeof TASK_FIELD_LABELS;
