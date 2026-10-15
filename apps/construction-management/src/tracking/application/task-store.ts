import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import type { LocationRef } from "@/src/shared-kernel/location-ref";

import type { TrackingDocumentFile } from "../domain/document-files";
import type { TaskStatus } from "../domain/task-progress";
import type { TrackingPriority } from "../domain/tracking-documents";
import type { TrackingTx } from "./ports";

/**
 * What the task handlers and the recompute read and write (CM-802). The
 * Prisma implementation is `infrastructure/prisma-task-store.ts`.
 */

/** A live task as stored, with its assignees and tags. */
export type TaskRow = {
  id: string;
  workspaceId: string;
  projectId: string;
  taskNo: number;
  parentId: string | null;
  depth: number;
  sortOrder: number;
  name: string;
  description: string | null;
  startDate: CalendarDate | null;
  dueDate: CalendarDate | null;
  priority: TrackingPriority | null;
  siteLocation: LocationRef | null;
  extraLocations: LocationRef[];
  departmentId: string | null;
  contractorId: string | null;
  totalWorkMilli: bigint | null;
  totalWorkUnitId: string | null;
  totalPrice: bigint | null;
  /** Cached by the recompute, leaf and summary alike. */
  completedMilli: bigint;
  pct: number;
  actualStart: CalendarDate | null;
  actualEnd: CalendarDate | null;
  /** The latest baseline (leaf tasks). */
  baselineStart: CalendarDate | null;
  baselineEnd: CalendarDate | null;
  baselineVersion: number;
  copiedFromId: string | null;
  assigneeIds: string[];
  tagIds: string[];
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
};

/** What a save writes besides numbers, tree position and bookkeeping. */
export type TaskContent = {
  name: string;
  description: string | null;
  startDate: CalendarDate | null;
  dueDate: CalendarDate | null;
  priority: TrackingPriority | null;
  siteLocation: LocationRef | null;
  extraLocations: readonly LocationRef[];
  departmentId: string | null;
  contractorId: string | null;
  totalWorkMilli: bigint | null;
  totalWorkUnitId: string | null;
  totalPrice: bigint | null;
  assigneeIds: readonly string[];
  tagIds: readonly string[];
};

export type NewTaskRow = TaskContent & {
  id: string;
  workspaceId: string;
  projectId: string;
  taskNo: number;
  parentId: string | null;
  depth: number;
  sortOrder: number;
  copiedFromId: string | null;
  by: string;
  at: Date;
};

/** A progress update as stored. */
export type ProgressRow = {
  id: string;
  workspaceId: string;
  taskId: string;
  progressDate: CalendarDate;
  workMilli: bigint | null;
  pct: number | null;
  remark: string | null;
  source: "manual" | "worksheet";
  worksheetId: string | null;
  worksheetNumber: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
};

export type BaselineRow = {
  id: string;
  version: number;
  startDate: CalendarDate;
  endDate: CalendarDate;
  reason: string | null;
  createdAt: Date;
  createdBy: string;
};

/** Activity feed kinds (the schema comment, CM-0019 §4). */
export const TASK_ACTIVITY_KINDS = [
  "created",
  "edited",
  "assignees_changed",
  "rebaselined",
  "progress_recorded",
  "progress_edited",
  "progress_deleted",
  "completed",
  "reopened",
  "subtask_added",
  "copied",
  "worksheet_progress",
] as const;
export type TaskActivityKind = (typeof TASK_ACTIVITY_KINDS)[number];

export type ActivityRow = {
  id: string;
  taskId: string;
  kind: TaskActivityKind;
  payload: Record<string, unknown> | null;
  createdAt: Date;
  createdBy: string;
};

export type NewActivity = {
  taskId: string;
  kind: TaskActivityKind;
  payload?: Record<string, unknown> | null;
};

/** Cached figures the recompute writes (CM-0019 §3, §4). */
export type TaskCached = {
  completedMilli: bigint;
  pct: number;
  actualStart: CalendarDate | null;
  actualEnd: CalendarDate | null;
};

/** List filters the SQL applies (status through `taskStatusSql`). */
export type TaskFilter = {
  workspaceId: string;
  projectId: string;
  today: CalendarDate;
  status?: TaskStatus;
  /** A Team Member id among the assignees. */
  assigneeId?: string;
  priority?: TrackingPriority;
  tagId?: string;
  departmentId?: string;
  contractorId?: string;
  /** A Wing, Amenity, Common Development or Location id, in the main or another location. */
  locationId?: string;
  /** Planned span (rolled up for summary tasks) overlapping `from`–`to`. */
  from?: CalendarDate;
  to?: CalendarDate;
  /** Task No. (`12`, `T-12`) or part of the name. */
  search?: string;
};

export type TaskStore = {
  /** Every live task of the Project with assignees and tags. */
  projectTasks(
    db: TrackingTx,
    workspaceId: string,
    projectId: string,
  ): Promise<TaskRow[]>;
  find(
    db: TrackingTx,
    workspaceId: string,
    id: string,
  ): Promise<TaskRow | null>;
  /** Live tasks by id (any Project of the Company). */
  findMany(
    db: TrackingTx,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<TaskRow[]>;
  /**
   * Locks live tasks `FOR UPDATE`, shallowest first (so two writers in one
   * tree never deadlock), and returns them.
   */
  lock(
    db: TrackingTx,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<TaskRow[]>;
  /** A live task and its live ancestors, nearest first; empty when the task is not live. */
  chain(db: TrackingTx, id: string): Promise<TaskRow[]>;
  /** The live sub-tasks and theirs of a task. */
  descendants(db: TrackingTx, id: string): Promise<TaskRow[]>;
  /** Ids of live tasks matching the filter (no visibility applied). */
  matching(db: TrackingTx, filter: TaskFilter): Promise<Set<string>>;
  /** The next `count` Task Nos. of the Project, under the counter's row lock. */
  allocateNumbers(
    db: TrackingTx,
    workspaceId: string,
    projectId: string,
    count: number,
  ): Promise<number>;
  /** One past the last live sibling's sort order. */
  nextSortOrder(
    db: TrackingTx,
    projectId: string,
    parentId: string | null,
  ): Promise<number>;
  /** Moves live siblings after `sortOrder` down by `by` places. */
  shiftSiblings(
    db: TrackingTx,
    projectId: string,
    parentId: string | null,
    sortOrder: number,
    by: number,
  ): Promise<void>;
  insert(db: TrackingTx, row: NewTaskRow): Promise<void>;
  replace(
    db: TrackingTx,
    id: string,
    content: TaskContent & { by: string; at: Date },
  ): Promise<void>;
  /** Writes the cached figures; leaves `updated_at` alone. */
  setCached(db: TrackingTx, id: string, cached: TaskCached): Promise<void>;
  tombstone(
    db: TrackingTx,
    ids: readonly string[],
    by: string,
    at: Date,
  ): Promise<void>;
  /** Adds a baseline version and mirrors it on the task. */
  addBaseline(
    db: TrackingTx,
    row: {
      workspaceId: string;
      taskId: string;
      version: number;
      startDate: CalendarDate;
      endDate: CalendarDate;
      reason: string | null;
      by: string;
      at: Date;
    },
  ): Promise<void>;
  baselines(db: TrackingTx, taskId: string): Promise<BaselineRow[]>;
  /** Live updates of a task, oldest first. */
  progress(db: TrackingTx, taskId: string): Promise<ProgressRow[]>;
  findProgress(
    db: TrackingTx,
    workspaceId: string,
    id: string,
  ): Promise<ProgressRow | null>;
  insertProgress(
    db: TrackingTx,
    row: {
      id: string;
      workspaceId: string;
      taskId: string;
      progressDate: CalendarDate;
      workMilli: bigint | null;
      pct: number | null;
      remark: string | null;
      /** A Daily Worksheet's update (CM-806); manual when left out. */
      worksheet?: { id: string; number: string } | null;
      by: string;
      at: Date;
    },
  ): Promise<void>;
  /** The live update a Daily Worksheet posted, if any. */
  worksheetProgress(
    db: TrackingTx,
    workspaceId: string,
    worksheetId: string,
  ): Promise<ProgressRow | null>;
  updateProgress(
    db: TrackingTx,
    id: string,
    values: {
      progressDate: CalendarDate;
      workMilli: bigint | null;
      pct: number | null;
      remark: string | null;
      by: string;
      at: Date;
    },
  ): Promise<void>;
  tombstoneProgress(
    db: TrackingTx,
    id: string,
    by: string,
    at: Date,
  ): Promise<void>;
  /** Live update counts by task. */
  progressCounts(
    db: TrackingTx,
    taskIds: readonly string[],
  ): Promise<Map<string, number>>;
  /**
   * Attaches uploaded photos to a progress update (400
   * `DOCUMENT_FILE_NOT_FOUND` for ids that are not the uploader's
   * unattached photos of the task; at most 10).
   */
  attachPhotos(
    db: TrackingTx,
    input: {
      workspaceId: string;
      taskId: string;
      progressId: string;
      fileIds: readonly string[];
      by: string;
    },
  ): Promise<TrackingDocumentFile[]>;
  /** Live photos of progress updates, by update id, oldest first. */
  photos(
    db: TrackingTx,
    workspaceId: string,
    taskId: string,
    progressIds: readonly string[],
  ): Promise<Map<string, TrackingDocumentFile[]>>;
  /**
   * Tombstones the photos of one update, or of every file of the task when
   * `progressId` is left out; returns them for the Gallery.
   */
  removePhotos(
    db: TrackingTx,
    input: {
      workspaceId: string;
      taskId: string;
      progressId?: string;
      by: string;
      at: Date;
    },
  ): Promise<TrackingDocumentFile[]>;
  addActivities(
    db: TrackingTx,
    workspaceId: string,
    by: string,
    at: Date,
    rows: readonly NewActivity[],
  ): Promise<void>;
  /** Newest first. */
  activities(
    db: TrackingTx,
    taskId: string,
    limit: number,
  ): Promise<ActivityRow[]>;
};
