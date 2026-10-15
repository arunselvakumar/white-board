import { assertCan, can, type MemberAccess } from "@/src/shared-kernel/access";
import { recordAudit } from "@/src/shared-kernel/audit";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import {
  conflict,
  DomainError,
  notFound,
} from "@/src/shared-kernel/domain-error";
import type { DomainEvent, EventDispatcher } from "@/src/shared-kernel/events";
import { newId } from "@/src/shared-kernel/ids";
import {
  locationRef,
  type LocationRef,
  type LocationRefInput,
  type LocationResolver,
} from "@/src/shared-kernel/location-ref";

import {
  trackingFilesMediaRemoved,
  type TrackingDocumentFile,
} from "../domain/document-files";
import type {
  TaskAssigned,
  TaskCompleted,
  TaskProgressRecorded,
} from "../domain/events";
import {
  assertKindKept,
  childDepth,
  childrenByParent,
  descendantsOf,
  progressFields,
  rebaselineReason,
  TASK_LIMITS,
  TASK_MAX_DEPTH,
  taskFields,
  taskNoLabel,
  taskVisibility,
  treeOrder,
  type ProgressInput,
  type TaskChangedField,
  type TaskFields,
  type TaskInput,
  type TaskViewer,
} from "../domain/task";
import {
  completionEntry,
  FULL_PCT,
  percentValue,
  quantityText,
} from "../domain/task-progress";
import { TRACKING_DOCUMENTS } from "../domain/tracking-documents";
import type {
  TrackingDirectory,
  TrackingMemberFacts,
  TrackingNames,
  TrackingTx,
  TaskUsage,
} from "./ports";
import {
  recomputeTaskAndAncestors,
  type TaskRecomputed,
} from "./task-recompute";
import type {
  ActivityRow,
  BaselineRow,
  NewActivity,
  ProgressRow,
  TaskContent,
  TaskFilter,
  TaskRow,
  TaskStore,
} from "./task-store";
import { taskViews, type TaskView } from "./task-views";

const DOCUMENT = TRACKING_DOCUMENTS.task;
export const TASK_MENU = DOCUMENT.menu;

export const taskNotFound = () =>
  notFound("TASK_NOT_FOUND", "This task was not found.");

export const progressNotFound = () =>
  notFound("TASK_PROGRESS_NOT_FOUND", "This progress update was not found.");

export type TaskDb = TrackingTx & {
  $transaction<T>(
    fn: (tx: TrackingTx) => Promise<T>,
    options?: { timeout?: number; maxWait?: number },
  ): Promise<T>;
};

export type TaskDeps = {
  db: TaskDb;
  store: TaskStore;
  directory: TrackingDirectory;
  locations: LocationResolver;
  usage: TaskUsage;
  today: (workspaceId: string) => Promise<CalendarDate>;
  events: EventDispatcher;
  /** `ProjectMediaRemoved` for the Gallery when photos go (ADR CM-0014). */
  media: EventDispatcher;
  clock?: () => Date;
};

// ---------------------------------------------------------------------------
// Inputs and read models
// ---------------------------------------------------------------------------

export type TaskWriteInput = TaskInput & {
  siteLocation?: LocationRefInput | null;
  extraLocations?: readonly LocationRefInput[] | null;
};

export type TaskActions = {
  edit: boolean;
  delete: boolean;
  addSubTask: boolean;
  copy: boolean;
  recordProgress: boolean;
  markCompleted: boolean;
  rebaseline: boolean;
};

const NO_ACTIONS: TaskActions = {
  edit: false,
  delete: false,
  addSubTask: false,
  copy: false,
  recordProgress: false,
  markCompleted: false,
  rebaseline: false,
};

export type Named = { id: string; name: string | null };

/** A task as lists, the Gantt and the detail page show it. */
export type TaskReadModel = TaskView & {
  /** Shown greyed for the tree's sake: the viewer may not open it (CM-0019 §5). */
  contextOnly: boolean;
  /** Matches the list's filters (ancestors shown for context do not). */
  matched: boolean;
  assignees: Named[];
  department: Named | null;
  contractor: Named | null;
  tags: Named[];
  unit: Named | null;
  createdByName: string | null;
  /** Null without Task Financial. */
  financial: boolean;
  actions: TaskActions;
};

export type TaskDetailModel = TaskReadModel & {
  parents: { id: string; taskNo: number; name: string }[];
  children: TaskReadModel[];
  baselines: (BaselineRow & { createdByName: string | null })[];
};

export type ProgressReadModel = ProgressRow & {
  createdByName: string | null;
  photos: TrackingDocumentFile[];
  /** Uploader names by User id, for the photos. */
  photoNames: ReadonlyMap<string, string>;
  actions: { edit: boolean; delete: boolean };
};

export type ActivityReadModel = ActivityRow & {
  createdByName: string | null;
  /** Team Member names an `assignees_changed` row names. */
  memberNames: Record<string, string>;
};

export type TaskListParams = Omit<TaskFilter, "today" | "workspaceId"> & {
  limit: number;
  after?: string;
  before?: string;
};

export type TaskFormOptions = {
  members: TrackingMemberFacts[];
  departments: { id: string; name: string }[];
  contractors: { id: string; name: string; departmentIds: readonly string[] }[];
  units: { id: string; name: string }[];
  tags: { id: string; name: string }[];
};

/** A page of roots, each with its visible subtree, in tree order. */
export type TaskPage = {
  items: TaskReadModel[];
  nextCursor: string | null;
  prevCursor: string | null;
  /** Tasks that match (context rows not counted). */
  total: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function changed(
  row: { updatedAt: Date },
  expected: Date | null,
  code: string,
) {
  if (expected != null && row.updatedAt.getTime() !== expected.getTime())
    throw conflict(
      code,
      "Someone changed this in the meantime. Reload it and try again.",
      { updatedAt: row.updatedAt.toISOString() },
    );
}

function snapshot(content: TaskContent) {
  return {
    name: content.name,
    description: content.description,
    startDate: content.startDate,
    dueDate: content.dueDate,
    priority: content.priority,
    siteLocation: content.siteLocation,
    extraLocations: content.extraLocations,
    departmentId: content.departmentId,
    contractorId: content.contractorId,
    totalWorkQty:
      content.totalWorkMilli == null
        ? null
        : quantityText(content.totalWorkMilli),
    totalWorkUnitId: content.totalWorkUnitId,
    totalPrice: content.totalPrice?.toString() ?? null,
    assigneeIds: content.assigneeIds,
    tagIds: content.tagIds,
  };
}

function contentOf(row: TaskRow): TaskContent {
  return {
    name: row.name,
    description: row.description,
    startDate: row.startDate,
    dueDate: row.dueDate,
    priority: row.priority,
    siteLocation: row.siteLocation,
    extraLocations: row.extraLocations,
    departmentId: row.departmentId,
    contractorId: row.contractorId,
    totalWorkMilli: row.totalWorkMilli,
    totalWorkUnitId: row.totalWorkUnitId,
    totalPrice: row.totalPrice,
    assigneeIds: row.assigneeIds,
    tagIds: row.tagIds,
  };
}

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((item) => b.includes(item));

const json = (value: unknown) => JSON.stringify(value);

/** The fields an edit changed, for the feed's `edited` row. */
function changedFields(
  before: TaskContent,
  after: TaskContent,
): TaskChangedField[] {
  const out: TaskChangedField[] = [];
  if (before.name !== after.name) out.push("name");
  if (before.description !== after.description) out.push("description");
  if (before.startDate !== after.startDate) out.push("startDate");
  if (before.dueDate !== after.dueDate) out.push("dueDate");
  if (before.priority !== after.priority) out.push("priority");
  if (json(before.siteLocation) !== json(after.siteLocation))
    out.push("siteLocation");
  if (json(before.extraLocations) !== json(after.extraLocations))
    out.push("extraLocations");
  if (before.departmentId !== after.departmentId) out.push("departmentId");
  if (before.contractorId !== after.contractorId) out.push("contractorId");
  if (!sameSet(before.tagIds, after.tagIds)) out.push("tagIds");
  if (
    before.totalWorkMilli !== after.totalWorkMilli ||
    before.totalWorkUnitId !== after.totalWorkUnitId
  )
    out.push("totalWork");
  if (before.totalPrice !== after.totalPrice) out.push("totalPrice");
  return out;
}

type RootCursor = { sortOrder: number; taskNo: number };

function encodeCursor(row: { sortOrder: number; taskNo: number }): string {
  return Buffer.from(
    `${String(row.sortOrder)}|${String(row.taskNo)}`,
    "utf8",
  ).toString("base64url");
}

function decodeCursor(raw: string): RootCursor {
  const [a, b] = Buffer.from(raw, "base64url").toString("utf8").split("|");
  const sortOrder = Number(a);
  const taskNo = Number(b);
  if (!Number.isInteger(sortOrder) || !Number.isInteger(taskNo))
    throw new DomainError("INVALID_CURSOR", "The page cursor is not valid.");
  return { sortOrder, taskNo };
}

const rootOrder = (a: RootCursor, b: RootCursor) =>
  a.sortOrder - b.sortOrder || a.taskNo - b.taskNo;

/** What a write leaves to do after commit. */
type Outcome = { events: DomainEvent[] };

/**
 * Task commands and queries (CM-802, ADR CM-0019 §2–§5). Every write is
 * one transaction with its audit event and activity rows; every change
 * that moves progress ends with `recomputeTaskAndAncestors` in the same
 * transaction. Events go out after commit.
 */
export class TaskHandlers {
  private readonly clock: () => Date;

  constructor(private readonly deps: TaskDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  private recompute(tx: TrackingTx, id: string): Promise<TaskRecomputed> {
    return recomputeTaskAndAncestors(tx, id, this.deps.store);
  }

  /** Who is looking: View all (or the Owner) and their Team Member id. */
  async viewer(access: MemberAccess, projectId: string): Promise<TaskViewer> {
    const viewAll = can(access, TASK_MENU, "view_all", { projectId });
    const member = viewAll
      ? null
      : await this.deps.directory.memberOfUser(
          this.deps.db,
          access.workspaceId,
          access.userId,
        );
    return { viewAll, userId: access.userId, memberId: member?.id ?? null };
  }

  private visibleTo(viewer: TaskViewer, row: TaskRow): boolean {
    return (
      viewer.viewAll ||
      row.createdBy === viewer.userId ||
      (viewer.memberId != null && row.assigneeIds.includes(viewer.memberId))
    );
  }

  /** A live task the viewer may open (404 otherwise, View all scoping included). */
  async findVisible(access: MemberAccess, id: string): Promise<TaskRow> {
    const row = await this.find(access.workspaceId, id);
    const viewer = await this.viewer(access, row.projectId);
    if (!this.visibleTo(viewer, row)) throw taskNotFound();
    return row;
  }

  async find(workspaceId: string, id: string): Promise<TaskRow> {
    const row = await this.deps.store.find(this.deps.db, workspaceId, id);
    if (row == null) throw taskNotFound();
    return row;
  }

  /** The live task of a live progress update (404 otherwise). */
  async progressTask(
    workspaceId: string,
    progressId: string,
  ): Promise<TaskRow> {
    const row = await this.deps.store.findProgress(
      this.deps.db,
      workspaceId,
      progressId,
    );
    if (row == null) throw progressNotFound();
    return this.find(workspaceId, row.taskId);
  }

  /**
   * Tells the Project Gallery photos went away, after commit. The Gallery
   * is an index: a failure is logged, never turned into an error.
   */
  private async removeFromGallery(
    files: readonly TrackingDocumentFile[],
    at: Date,
  ) {
    const events = trackingFilesMediaRemoved(files, at);
    if (events.length === 0) return;
    try {
      await this.deps.media.dispatch(events);
    } catch (error) {
      console.error("Could not update the Project Gallery", error);
    }
  }

  private async dispatch(outcome: Outcome) {
    if (outcome.events.length > 0)
      await this.deps.events.dispatch(outcome.events);
  }

  // -------------------------------------------------------------------------
  // Fields and references
  // -------------------------------------------------------------------------

  /**
   * Checks a form's fields against the Project: new Team Members active
   * and on the Project, new Departments and Units enabled, new
   * Contractors active and on the Project, Tags the Company's, locations
   * on the Project (extra ones of the main one's type and Wing). Values
   * kept from `current` may stay even if they would not be offered now.
   */
  private async content(
    access: MemberAccess,
    projectId: string,
    input: TaskWriteInput,
    current: TaskRow | null,
    summary: boolean,
  ): Promise<TaskContent> {
    const fields: TaskFields = taskFields(input);
    const financial = can(access, TASK_MENU, "financial", { projectId });
    const workspaceId = access.workspaceId;
    const refs = await this.deps.directory.references(
      this.deps.db,
      workspaceId,
      projectId,
      {
        memberIds: fields.assigneeIds,
        departmentIds: fields.departmentId == null ? [] : [fields.departmentId],
        contractorIds: fields.contractorId == null ? [] : [fields.contractorId],
        unitIds: fields.totalWorkUnitId == null ? [] : [fields.totalWorkUnitId],
        tagIds: fields.tagIds,
      },
    );
    const refuse = (
      code: string,
      message: string,
      field: string,
      ids: string[],
    ) => new DomainError(code, message, { details: { field, ids } });
    const newMembers = fields.assigneeIds.filter(
      (id) => !(current?.assigneeIds.includes(id) ?? false),
    );
    const badMembers = newMembers.filter((id) => {
      const member = refs.members.get(id);
      return member == null || !member.active || !member.onProject;
    });
    if (badMembers.length > 0)
      throw refuse(
        "ASSIGNEE_NOT_ON_PROJECT",
        "Assign Team Members who are on this Project.",
        "assigneeIds",
        badMembers,
      );
    if (
      fields.departmentId != null &&
      fields.departmentId !== current?.departmentId
    ) {
      const department = refs.departments.get(fields.departmentId);
      if (department == null || department.disabled)
        throw refuse(
          "DEPARTMENT_NOT_FOUND",
          "Choose a Department in use.",
          "departmentId",
          [fields.departmentId],
        );
    }
    if (
      fields.contractorId != null &&
      fields.contractorId !== current?.contractorId
    ) {
      const contractor = refs.contractors.get(fields.contractorId);
      if (contractor == null || !contractor.isActive || !contractor.onProject)
        throw refuse(
          "CONTRACTOR_NOT_ON_PROJECT",
          "Choose a Contractor assigned to this Project.",
          "contractorId",
          [fields.contractorId],
        );
    }
    if (
      fields.totalWorkUnitId != null &&
      fields.totalWorkUnitId !== current?.totalWorkUnitId
    ) {
      const unit = refs.units.get(fields.totalWorkUnitId);
      if (unit == null || unit.disabled)
        throw refuse(
          "UNIT_NOT_FOUND",
          "Choose a Measurement Unit in use.",
          "totalWorkUnitId",
          [fields.totalWorkUnitId],
        );
    }
    const missingTags = fields.tagIds.filter((id) => !refs.tags.has(id));
    if (missingTags.length > 0)
      throw refuse(
        "TAG_NOT_FOUND",
        "This tag was not found.",
        "tagIds",
        missingTags,
      );

    const siteLocation =
      input.siteLocation == null ? null : locationRef(input.siteLocation);
    const extras = (input.extraLocations ?? []).map(locationRef);
    if (extras.length > TASK_LIMITS.extraLocations)
      throw new DomainError(
        "TASK_TOO_MANY_LOCATIONS",
        `Add at most ${String(TASK_LIMITS.extraLocations)} other locations.`,
        { details: { field: "extraLocations" } },
      );
    if (extras.length > 0) {
      if (siteLocation == null)
        throw new DomainError(
          "TASK_LOCATION_REQUIRED",
          "Choose the main location before adding others.",
          { details: { field: "siteLocation" } },
        );
      const bad = extras.findIndex(
        (ref) =>
          ref.type !== siteLocation.type ||
          (ref.type === "wing" &&
            siteLocation.type === "wing" &&
            ref.wingId !== siteLocation.wingId),
      );
      if (bad >= 0)
        throw new DomainError(
          "TASK_LOCATION_MISMATCH",
          siteLocation.type === "wing"
            ? "Other locations must be in the same Wing as the main one."
            : "Other locations must be of the same Location Type as the main one.",
          { details: { field: `extraLocations.${String(bad)}` } },
        );
    }
    const unchanged = (ref: LocationRef) =>
      current != null &&
      [current.siteLocation, ...current.extraLocations].some(
        (old) => json(old) === json(ref),
      );
    for (const ref of [siteLocation, ...extras])
      if (ref != null && !unchanged(ref))
        await this.deps.locations.assertOnProject(workspaceId, projectId, ref);

    const kept = (value: bigint | null) =>
      financial ? fields.totalPrice : value;
    if (summary && current != null)
      // A summary task's dates, work and price roll up; they are not entered.
      return {
        ...fields,
        siteLocation,
        extraLocations: extras,
        startDate: current.startDate,
        dueDate: current.dueDate,
        totalWorkMilli: current.totalWorkMilli,
        totalWorkUnitId: current.totalWorkUnitId,
        totalPrice: current.totalPrice,
      };
    return {
      ...fields,
      siteLocation,
      extraLocations: extras,
      totalPrice: kept(current?.totalPrice ?? null),
    };
  }

  /** Version 1 of the baseline, the first time a leaf has both dates (CM-0019 §3). */
  private async firstBaseline(
    tx: TrackingTx,
    workspaceId: string,
    taskId: string,
    content: { startDate: CalendarDate | null; dueDate: CalendarDate | null },
    version: number,
    by: string,
    at: Date,
  ) {
    if (version > 0 || content.startDate == null || content.dueDate == null)
      return;
    await this.deps.store.addBaseline(tx, {
      workspaceId,
      taskId,
      version: 1,
      startDate: content.startDate,
      endDate: content.dueDate,
      reason: null,
      by,
      at,
    });
  }

  private assigned(
    row: { id: string; projectId: string; taskNo: number; createdBy: string },
    memberIds: readonly string[],
    by: string,
    workspaceId: string,
    at: Date,
  ): TaskAssigned[] {
    if (memberIds.length === 0) return [];
    return [
      {
        type: "TaskAssigned",
        workspaceId,
        occurredAt: at,
        taskId: row.id,
        projectId: row.projectId,
        taskNo: row.taskNo,
        memberIds,
        by,
        createdBy: row.createdBy,
      },
    ];
  }

  // -------------------------------------------------------------------------
  // Create, edit, sub-tasks, copy
  // -------------------------------------------------------------------------

  /**
   * Adds a task (CM-0019 §2, §5), or with `parentId` a sub-task at the end
   * of its siblings (three levels at most; a leaf with progress cannot
   * get sub-tasks). Its baseline is captured when it has both dates.
   */
  async create(
    access: MemberAccess,
    input: TaskWriteInput & { projectId: string; parentId?: string | null },
  ): Promise<string> {
    const projectId = input.projectId;
    assertCan(access, TASK_MENU, "create", { projectId });
    const { db, store } = this.deps;
    const rawParent = input.parentId?.trim().toLowerCase() ?? "";
    const parentId = rawParent === "" ? null : rawParent;
    const content = await this.content(access, projectId, input, null, false);
    const id = newId();
    const at = this.clock();
    const by = access.userId;
    const workspaceId = access.workspaceId;
    let taskNo = 0;
    await db.$transaction(async (tx) => {
      let depth = 1;
      if (parentId != null) {
        const [parent] = await store.lock(tx, workspaceId, [parentId]);
        if (parent?.projectId !== projectId)
          throw new DomainError(
            "PARENT_TASK_NOT_FOUND",
            "The task to add a sub-task to was not found on this Project.",
            { details: { field: "parentId" } },
          );
        const viewer = await this.viewer(access, projectId);
        if (!this.visibleTo(viewer, parent)) throw taskNotFound();
        depth = childDepth(parent.depth);
        const siblings = await store.descendants(tx, parent.id);
        if (siblings.length === 0) {
          const counts = await store.progressCounts(tx, [parent.id]);
          if ((counts.get(parent.id) ?? 0) > 0)
            throw conflict(
              "TASK_HAS_PROGRESS",
              "This task has progress updates, so it cannot get sub-tasks. Delete its updates first.",
              { field: "parentId" },
            );
          // A worksheet's task must stay a leaf, or its work would post
          // nowhere (CM-0019 §6).
          const worksheets = await this.deps.usage.worksheetCounts(
            tx,
            workspaceId,
            [parent.id],
          );
          const worksheetCount = worksheets.get(parent.id) ?? 0;
          if (worksheetCount > 0)
            throw conflict(
              "TASK_IN_USE",
              "Daily Worksheets name this task, so it cannot get sub-tasks. Point those worksheets at another task first.",
              { field: "parentId", worksheetCount },
            );
        }
      }
      taskNo = await store.allocateNumbers(tx, workspaceId, projectId, 1);
      const sortOrder = await store.nextSortOrder(tx, projectId, parentId);
      await store.insert(tx, {
        ...content,
        id,
        workspaceId,
        projectId,
        taskNo,
        parentId,
        depth,
        sortOrder,
        copiedFromId: null,
        by,
        at,
      });
      await this.firstBaseline(tx, workspaceId, id, content, 0, by, at);
      const activities: NewActivity[] = [
        {
          taskId: id,
          kind: "created",
          payload: { taskNo, name: content.name },
        },
      ];
      if (parentId != null)
        activities.push({
          taskId: parentId,
          kind: "subtask_added",
          payload: { subTaskId: id, taskNo, name: content.name },
        });
      if (content.assigneeIds.length > 0)
        activities.push({
          taskId: id,
          kind: "assignees_changed",
          payload: { added: content.assigneeIds, removed: [] },
        });
      await store.addActivities(tx, workspaceId, by, at, activities);
      await this.recompute(tx, id);
      await recordAudit(tx, {
        workspaceId,
        actorUserId: by,
        action: "task.created",
        entityType: "task",
        entityId: id,
        after: { taskNo, projectId, parentId, ...snapshot(content) },
        occurredAt: at,
      });
    });
    await this.dispatch({
      events: this.assigned(
        { id, projectId, taskNo, createdBy: by },
        content.assigneeIds,
        by,
        workspaceId,
        at,
      ),
    });
    return id;
  }

  /**
   * Edits a task (CM-0019 §5). A summary task's dates, work and price are
   * not entered; a leaf with progress keeps its kind and unit. The
   * baseline is captured the first time a leaf has both dates; later
   * date changes leave it (Re-baseline moves it).
   */
  async edit(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
    input: TaskWriteInput,
  ): Promise<void> {
    const { db, store } = this.deps;
    const current = await this.findVisible(access, id);
    assertCan(access, TASK_MENU, "update", { projectId: current.projectId });
    const below = await store.descendants(db, id);
    const summary = below.length > 0;
    const next = await this.content(
      access,
      current.projectId,
      input,
      current,
      summary,
    );
    const at = this.clock();
    const by = access.userId;
    const workspaceId = access.workspaceId;
    let added: string[] = [];
    await db.$transaction(async (tx) => {
      const [locked] = await store.lock(tx, workspaceId, [id]);
      if (locked == null) throw taskNotFound();
      changed(locked, expectedUpdatedAt, "TASK_CHANGED");
      if (!summary) {
        const counts = await store.progressCounts(tx, [id]);
        assertKindKept(locked, next, counts.get(id) ?? 0);
      }
      await store.replace(tx, id, { ...next, by, at });
      if (!summary)
        await this.firstBaseline(
          tx,
          workspaceId,
          id,
          next,
          locked.baselineVersion,
          by,
          at,
        );
      const before = contentOf(locked);
      const fields = changedFields(before, next);
      added = next.assigneeIds.filter((m) => !before.assigneeIds.includes(m));
      const removed = before.assigneeIds.filter(
        (m) => !next.assigneeIds.includes(m),
      );
      const activities: NewActivity[] = [];
      if (fields.length > 0)
        activities.push({ taskId: id, kind: "edited", payload: { fields } });
      if (added.length > 0 || removed.length > 0)
        activities.push({
          taskId: id,
          kind: "assignees_changed",
          payload: { added, removed },
        });
      await store.addActivities(tx, workspaceId, by, at, activities);
      await this.recompute(tx, id);
      await recordAudit(tx, {
        workspaceId,
        actorUserId: by,
        action: "task.updated",
        entityType: "task",
        entityId: id,
        before: snapshot(before),
        after: snapshot(next),
        occurredAt: at,
      });
    });
    await this.dispatch({
      events: this.assigned(current, added, by, workspaceId, at),
    });
  }

  /**
   * **Copy task** ("Paste Task below", CM-0019 §2): a copy of the task and
   * its sub-tasks right after it, at the same level, with new Task Nos.
   * Progress, activity, actuals and the baseline are left out; each copy
   * gets its own baseline from its dates.
   */
  async copy(access: MemberAccess, id: string): Promise<string> {
    const { db, store } = this.deps;
    const original = await this.findVisible(access, id);
    const projectId = original.projectId;
    assertCan(access, TASK_MENU, "create", { projectId });
    const at = this.clock();
    const by = access.userId;
    const workspaceId = access.workspaceId;
    const rootId = newId();
    await db.$transaction(async (tx) => {
      const [locked] = await store.lock(tx, workspaceId, [id]);
      if (locked == null) throw taskNotFound();
      const all = await store.projectTasks(tx, workspaceId, projectId);
      const subtree = [
        locked,
        ...descendantsOf(childrenByParent(all), locked.id),
      ];
      const first = await store.allocateNumbers(
        tx,
        workspaceId,
        projectId,
        subtree.length,
      );
      await store.shiftSiblings(
        tx,
        projectId,
        locked.parentId,
        locked.sortOrder,
        1,
      );
      const ids = new Map<string, string>([[locked.id, rootId]]);
      for (const row of subtree) if (!ids.has(row.id)) ids.set(row.id, newId());
      const leaves = new Set(
        subtree
          .filter((row) => !subtree.some((other) => other.parentId === row.id))
          .map((row) => row.id),
      );
      const activities: NewActivity[] = [];
      for (const [index, row] of subtree.entries()) {
        const copyId = ids.get(row.id) ?? newId();
        const isRoot = row.id === locked.id;
        await store.insert(tx, {
          ...contentOf(row),
          id: copyId,
          workspaceId,
          projectId,
          taskNo: first + index,
          parentId: isRoot
            ? row.parentId
            : (ids.get(row.parentId ?? "") ?? null),
          depth: row.depth,
          sortOrder: isRoot ? row.sortOrder + 1 : row.sortOrder,
          copiedFromId: row.id,
          by,
          at,
        });
        if (leaves.has(row.id))
          await this.firstBaseline(tx, workspaceId, copyId, row, 0, by, at);
        activities.push({
          taskId: copyId,
          kind: "copied",
          payload: { fromTaskId: row.id, fromTaskNo: row.taskNo },
        });
      }
      await store.addActivities(tx, workspaceId, by, at, activities);
      await this.recompute(tx, rootId);
      await recordAudit(tx, {
        workspaceId,
        actorUserId: by,
        action: "task.copied",
        entityType: "task",
        entityId: rootId,
        after: {
          fromTaskId: locked.id,
          tasks: subtree.length,
          firstTaskNo: first,
        },
        occurredAt: at,
      });
    });
    return rootId;
  }

  // -------------------------------------------------------------------------
  // Delete (single and bulk, all or none)
  // -------------------------------------------------------------------------

  /**
   * Soft-deletes tasks and their sub-tasks (CM-0019 §2), all or none. 404
   * names an id that is not a task the viewer sees on the Project; 409
   * `TASK_IN_USE` lists every task (or sub-task) a live Daily Worksheet
   * names, with `details.worksheetCount`.
   */
  async delete(
    access: MemberAccess,
    projectId: string,
    ids: readonly string[],
    expectedUpdatedAt: Date | null = null,
  ): Promise<{ deleted: number }> {
    assertCan(access, TASK_MENU, "delete", { projectId });
    const { db, store, usage } = this.deps;
    const unique = [...new Set(ids.map((id) => id.toLowerCase()))];
    if (unique.length === 0)
      throw new DomainError("TASKS_REQUIRED", "Choose the tasks to delete.");
    if (unique.length > TASK_LIMITS.bulk)
      throw new DomainError(
        "TOO_MANY_TASKS",
        `Delete at most ${String(TASK_LIMITS.bulk)} tasks at a time.`,
      );
    const viewer = await this.viewer(access, projectId);
    const at = this.clock();
    const by = access.userId;
    const workspaceId = access.workspaceId;
    let deleted = 0;
    const removed: TrackingDocumentFile[] = [];
    await db.$transaction(async (tx) => {
      const all = await store.projectTasks(tx, workspaceId, projectId);
      const byId = new Map(all.map((row) => [row.id, row]));
      const missing = unique.filter((id) => {
        const row = byId.get(id);
        return row == null || !this.visibleTo(viewer, row);
      });
      if (missing.length > 0)
        throw new DomainError("TASK_NOT_FOUND", "A task was not found.", {
          kind: "not_found",
          details: { ids: missing },
        });
      const children = childrenByParent(all);
      const chosen = new Set(unique);
      // Roots: chosen tasks none of whose ancestors are chosen.
      const roots = unique
        .map((id) => byId.get(id))
        .filter((row): row is TaskRow => row != null)
        .filter((row) => {
          let parentId = row.parentId;
          while (parentId != null) {
            if (chosen.has(parentId)) return false;
            parentId = byId.get(parentId)?.parentId ?? null;
          }
          return true;
        });
      await store.lock(
        tx,
        workspaceId,
        roots.map((row) => row.id),
      );
      if (expectedUpdatedAt != null && roots.length === 1 && roots[0] != null)
        changed(roots[0], expectedUpdatedAt, "TASK_CHANGED");
      const subtree = roots.flatMap((row) => [
        row,
        ...descendantsOf(children, row.id),
      ]);
      const counts = await usage.worksheetCounts(
        tx,
        workspaceId,
        subtree.map((row) => row.id),
      );
      const used = subtree.filter((row) => (counts.get(row.id) ?? 0) > 0);
      if (used.length > 0) {
        const worksheetCount = used.reduce(
          (sum, row) => sum + (counts.get(row.id) ?? 0),
          0,
        );
        throw conflict(
          "TASK_IN_USE",
          used.length === 1
            ? `${taskNoLabel(used[0]?.taskNo ?? 0)} is named by ${String(worksheetCount)} Daily ${worksheetCount === 1 ? "Worksheet" : "Worksheets"}. Unlink ${worksheetCount === 1 ? "it" : "them"} first.`
            : `${String(used.length)} tasks are named by Daily Worksheets. Unlink them first.`,
          {
            worksheetCount,
            tasks: used.map((row) => ({
              id: row.id,
              taskNo: row.taskNo,
              name: row.name,
              worksheetCount: counts.get(row.id) ?? 0,
            })),
          },
        );
      }
      await store.tombstone(
        tx,
        subtree.map((row) => row.id),
        by,
        at,
      );
      for (const row of subtree)
        removed.push(
          ...(await store.removePhotos(tx, {
            workspaceId,
            taskId: row.id,
            by,
            at,
          })),
        );
      deleted = subtree.length;
      const parents = new Set(
        roots.flatMap((row) => (row.parentId == null ? [] : [row.parentId])),
      );
      for (const parentId of parents)
        if (!subtree.some((row) => row.id === parentId))
          await this.recompute(tx, parentId);
      for (const root of roots)
        await recordAudit(tx, {
          workspaceId,
          actorUserId: by,
          action: "task.deleted",
          entityType: "task",
          entityId: root.id,
          before: {
            taskNo: root.taskNo,
            subTasks: descendantsOf(children, root.id).length,
            ...snapshot(contentOf(root)),
          },
          occurredAt: at,
        });
    });
    await this.removeFromGallery(removed, at);
    return { deleted };
  }

  // -------------------------------------------------------------------------
  // Baseline
  // -------------------------------------------------------------------------

  /**
   * **Re-baseline** (CM-0019 §3, Task Update): copies the planned dates
   * into the next baseline version, with a reason. Leaf tasks with both
   * dates only: a summary's baseline is its sub-tasks' span.
   */
  async rebaseline(
    access: MemberAccess,
    id: string,
    input: { reason: string; expectedUpdatedAt?: Date | null },
  ): Promise<void> {
    const { db, store } = this.deps;
    const current = await this.findVisible(access, id);
    assertCan(access, TASK_MENU, "update", { projectId: current.projectId });
    const reason = rebaselineReason(input.reason);
    const at = this.clock();
    const by = access.userId;
    const workspaceId = access.workspaceId;
    await db.$transaction(async (tx) => {
      const [locked] = await store.lock(tx, workspaceId, [id]);
      if (locked == null) throw taskNotFound();
      changed(locked, input.expectedUpdatedAt ?? null, "TASK_CHANGED");
      if ((await store.descendants(tx, id)).length > 0)
        throw this.summaryRefusal();
      if (locked.startDate == null || locked.dueDate == null)
        throw new DomainError(
          "TASK_DATES_REQUIRED",
          "Give the task a Start Date and a Due Date first.",
          { details: { field: "dueDate" } },
        );
      const version = locked.baselineVersion + 1;
      await store.addBaseline(tx, {
        workspaceId,
        taskId: id,
        version,
        startDate: locked.startDate,
        endDate: locked.dueDate,
        reason,
        by,
        at,
      });
      await store.addActivities(tx, workspaceId, by, at, [
        {
          taskId: id,
          kind: "rebaselined",
          payload: {
            version,
            startDate: locked.startDate,
            endDate: locked.dueDate,
            previous:
              locked.baselineStart == null
                ? null
                : {
                    startDate: locked.baselineStart,
                    endDate: locked.baselineEnd,
                  },
            reason,
          },
        },
      ]);
      await recordAudit(tx, {
        workspaceId,
        actorUserId: by,
        action: "task.rebaselined",
        entityType: "task",
        entityId: id,
        before: {
          version: locked.baselineVersion,
          startDate: locked.baselineStart,
          endDate: locked.baselineEnd,
        },
        after: {
          version,
          startDate: locked.startDate,
          endDate: locked.dueDate,
          reason,
        },
        occurredAt: at,
      });
    });
  }

  // -------------------------------------------------------------------------
  // Progress (CM-0019 §4)
  // -------------------------------------------------------------------------

  private summaryRefusal(): DomainError {
    return conflict(
      "TASK_IS_SUMMARY",
      "This task has sub-tasks: its progress rolls up from them. Update a sub-task instead.",
    );
  }

  /** Feed rows and events when an update moved a task across 100 %. */
  private crossing(
    task: TaskRow,
    result: TaskRecomputed,
    workspaceId: string,
    by: string,
    at: Date,
  ): { activities: NewActivity[]; events: DomainEvent[] } {
    const before = result.before?.pct ?? 0;
    const after = result.after;
    if (after == null) return { activities: [], events: [] };
    if (before < FULL_PCT && after.pct >= FULL_PCT && after.actualEnd != null) {
      const completed: TaskCompleted = {
        type: "TaskCompleted",
        workspaceId,
        occurredAt: at,
        taskId: task.id,
        projectId: task.projectId,
        taskNo: task.taskNo,
        actualEnd: after.actualEnd,
        by,
        createdBy: task.createdBy,
        assigneeMemberIds: task.assigneeIds,
      };
      return {
        activities: [
          {
            taskId: task.id,
            kind: "completed",
            payload: { actualEnd: after.actualEnd },
          },
        ],
        events: [completed],
      };
    }
    if (before >= FULL_PCT && after.pct < FULL_PCT)
      return {
        activities: [
          {
            taskId: task.id,
            kind: "reopened",
            payload: { progressPct: percentValue(after.pct) },
          },
        ],
        events: [],
      };
    return { activities: [], events: [] };
  }

  private recorded(
    task: TaskRow,
    progressId: string,
    progressDate: CalendarDate,
    after: TaskRecomputed,
    workspaceId: string,
    by: string,
    at: Date,
  ): TaskProgressRecorded {
    return {
      type: "TaskProgressRecorded",
      workspaceId,
      occurredAt: at,
      taskId: task.id,
      projectId: task.projectId,
      taskNo: task.taskNo,
      progressId,
      progressDate,
      progressPct: percentValue(after.after?.pct ?? 0),
      by,
      createdBy: task.createdBy,
      assigneeMemberIds: task.assigneeIds,
    };
  }

  private figures(fields: { workMilli: bigint | null; pct: number | null }) {
    return {
      workQty: fields.workMilli == null ? null : quantityText(fields.workMilli),
      progressPct: fields.pct == null ? null : percentValue(fields.pct),
    };
  }

  /**
   * **Update Task Progress** (Task Update): a quantity task takes the work
   * done in this update, a percent task the new percentage; not dated
   * after today; leaf tasks only (409 `TASK_IS_SUMMARY`). Totals, actuals
   * and the ancestors recompute in the same transaction.
   */
  async recordProgress(
    access: MemberAccess,
    taskId: string,
    input: ProgressInput & { fileIds?: readonly string[] | null },
    options: { complete?: boolean } = {},
  ): Promise<string> {
    const { db, store } = this.deps;
    const task = await this.findVisible(access, taskId);
    assertCan(access, TASK_MENU, "update", { projectId: task.projectId });
    const workspaceId = access.workspaceId;
    const today = await this.deps.today(workspaceId);
    const at = this.clock();
    const by = access.userId;
    const id = newId();
    const events: DomainEvent[] = [];
    await db.$transaction(async (tx) => {
      const chain = await store.chain(tx, taskId);
      const locked = (
        await store.lock(
          tx,
          workspaceId,
          chain.map((row) => row.id),
        )
      ).find((row) => row.id === taskId);
      if (locked == null) throw taskNotFound();
      if ((await store.descendants(tx, taskId)).length > 0)
        throw this.summaryRefusal();
      let fields;
      if (options.complete === true) {
        const date =
          input.progressDate.trim() === "" ? today : input.progressDate;
        const entry = completionEntry(locked, locked);
        fields = progressFields(
          locked,
          {
            progressDate: date,
            workQty:
              entry.workMilli == null ? null : quantityText(entry.workMilli),
            progressPct: entry.pct == null ? null : percentValue(entry.pct),
            remark: input.remark,
          },
          today,
        );
      } else fields = progressFields(locked, input, today);
      await store.insertProgress(tx, {
        id,
        workspaceId,
        taskId,
        ...fields,
        by,
        at,
      });
      await store.attachPhotos(tx, {
        workspaceId,
        taskId,
        progressId: id,
        fileIds: input.fileIds ?? [],
        by,
      });
      const result = await this.recompute(tx, taskId);
      const crossing = this.crossing(locked, result, workspaceId, by, at);
      await store.addActivities(tx, workspaceId, by, at, [
        {
          taskId,
          kind: "progress_recorded",
          payload: {
            progressId: id,
            progressDate: fields.progressDate,
            ...this.figures(fields),
            taskProgressPct: percentValue(result.after?.pct ?? 0),
            ...(options.complete === true ? { markedCompleted: true } : {}),
          },
        },
        ...crossing.activities,
      ]);
      await recordAudit(tx, {
        workspaceId,
        actorUserId: by,
        action:
          options.complete === true
            ? "task.completed"
            : "task.progress_recorded",
        entityType: "task",
        entityId: taskId,
        after: {
          progressId: id,
          progressDate: fields.progressDate,
          ...this.figures(fields),
          remark: fields.remark,
        },
        occurredAt: at,
      });
      events.push(
        this.recorded(
          locked,
          id,
          fields.progressDate,
          result,
          workspaceId,
          by,
          at,
        ),
        ...crossing.events,
      );
    });
    await this.dispatch({ events });
    return id;
  }

  /** **Mark As Completed**: the update that brings the task to 100 % on `date` (today by default). */
  markCompleted(
    access: MemberAccess,
    taskId: string,
    input: {
      progressDate?: string | null;
      remark?: string | null;
      fileIds?: readonly string[] | null;
    },
  ): Promise<string> {
    return this.recordProgress(
      access,
      taskId,
      {
        progressDate: input.progressDate ?? "",
        remark: input.remark,
        fileIds: input.fileIds,
      },
      { complete: true },
    );
  }

  /** The author, or a member with Task Update, may change a manual update. */
  private progressActions(
    access: MemberAccess,
    projectId: string,
    row: ProgressRow,
  ): { edit: boolean; delete: boolean } {
    const allowed =
      row.source === "manual" &&
      (row.createdBy === access.userId ||
        can(access, TASK_MENU, "update", { projectId }));
    return { edit: allowed, delete: allowed };
  }

  private async progressTarget(
    access: MemberAccess,
    progressId: string,
  ): Promise<{ row: ProgressRow; task: TaskRow }> {
    const row = await this.deps.store.findProgress(
      this.deps.db,
      access.workspaceId,
      progressId,
    );
    if (row == null) throw progressNotFound();
    const task = await this.findVisible(access, row.taskId);
    if (row.source === "worksheet")
      throw conflict(
        "PROGRESS_FROM_WORKSHEET",
        `This progress came from Daily Worksheet ${row.worksheetNumber ?? ""}. Change it on the worksheet.`.replace(
          "  ",
          " ",
        ),
      );
    if (!this.progressActions(access, task.projectId, row).edit)
      assertCan(access, TASK_MENU, "update", { projectId: task.projectId });
    return { row, task };
  }

  /** Edits a manual update (its author or Task Update); totals recompute. */
  async editProgress(
    access: MemberAccess,
    progressId: string,
    expectedUpdatedAt: Date,
    input: ProgressInput & { fileIds?: readonly string[] | null },
  ): Promise<void> {
    const { db, store } = this.deps;
    const { task } = await this.progressTarget(access, progressId);
    const workspaceId = access.workspaceId;
    const today = await this.deps.today(workspaceId);
    const at = this.clock();
    const by = access.userId;
    const events: DomainEvent[] = [];
    await db.$transaction(async (tx) => {
      const chain = await store.chain(tx, task.id);
      const locked = (
        await store.lock(
          tx,
          workspaceId,
          chain.map((row) => row.id),
        )
      ).find((row) => row.id === task.id);
      if (locked == null) throw taskNotFound();
      const row = await store.findProgress(tx, workspaceId, progressId);
      if (row == null) throw progressNotFound();
      changed(row, expectedUpdatedAt, "TASK_PROGRESS_CHANGED");
      const fields = progressFields(locked, input, today);
      await store.updateProgress(tx, progressId, { ...fields, by, at });
      await store.attachPhotos(tx, {
        workspaceId,
        taskId: task.id,
        progressId,
        fileIds: input.fileIds ?? [],
        by,
      });
      const result = await this.recompute(tx, task.id);
      const crossing = this.crossing(locked, result, workspaceId, by, at);
      await store.addActivities(tx, workspaceId, by, at, [
        {
          taskId: task.id,
          kind: "progress_edited",
          payload: {
            progressId,
            progressDate: fields.progressDate,
            ...this.figures(fields),
            taskProgressPct: percentValue(result.after?.pct ?? 0),
          },
        },
        ...crossing.activities,
      ]);
      await recordAudit(tx, {
        workspaceId,
        actorUserId: by,
        action: "task.progress_updated",
        entityType: "task",
        entityId: task.id,
        before: {
          progressId,
          progressDate: row.progressDate,
          ...this.figures(row),
          remark: row.remark,
        },
        after: {
          progressId,
          progressDate: fields.progressDate,
          ...this.figures(fields),
          remark: fields.remark,
        },
        occurredAt: at,
      });
      events.push(
        this.recorded(
          locked,
          progressId,
          fields.progressDate,
          result,
          workspaceId,
          by,
          at,
        ),
        ...crossing.events,
      );
    });
    await this.dispatch({ events });
  }

  /** Deletes a manual update (its author or Task Update); totals recompute and the task may reopen. */
  async deleteProgress(
    access: MemberAccess,
    progressId: string,
  ): Promise<void> {
    const { db, store } = this.deps;
    const { task } = await this.progressTarget(access, progressId);
    const workspaceId = access.workspaceId;
    const at = this.clock();
    const by = access.userId;
    const removed: TrackingDocumentFile[] = [];
    await db.$transaction(async (tx) => {
      const chain = await store.chain(tx, task.id);
      const locked = (
        await store.lock(
          tx,
          workspaceId,
          chain.map((row) => row.id),
        )
      ).find((row) => row.id === task.id);
      if (locked == null) throw taskNotFound();
      const row = await store.findProgress(tx, workspaceId, progressId);
      if (row == null) throw progressNotFound();
      await store.tombstoneProgress(tx, progressId, by, at);
      removed.push(
        ...(await store.removePhotos(tx, {
          workspaceId,
          taskId: task.id,
          progressId,
          by,
          at,
        })),
      );
      const result = await this.recompute(tx, task.id);
      const crossing = this.crossing(locked, result, workspaceId, by, at);
      await store.addActivities(tx, workspaceId, by, at, [
        {
          taskId: task.id,
          kind: "progress_deleted",
          payload: {
            progressId,
            progressDate: row.progressDate,
            ...this.figures(row),
            taskProgressPct: percentValue(result.after?.pct ?? 0),
          },
        },
        ...crossing.activities,
      ]);
      await recordAudit(tx, {
        workspaceId,
        actorUserId: by,
        action: "task.progress_deleted",
        entityType: "task",
        entityId: task.id,
        before: {
          progressId,
          progressDate: row.progressDate,
          ...this.figures(row),
          remark: row.remark,
        },
        occurredAt: at,
      });
    });
    await this.removeFromGallery(removed, at);
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  private actionsFor(
    access: MemberAccess,
    view: TaskView,
    contextOnly: boolean,
  ): TaskActions {
    if (contextOnly) return NO_ACTIONS;
    const scope = { projectId: view.projectId };
    const update = can(access, TASK_MENU, "update", scope);
    const create = can(access, TASK_MENU, "create", scope);
    const leaf = !view.isSummary;
    return {
      edit: update,
      delete: can(access, TASK_MENU, "delete", scope),
      addSubTask:
        create &&
        view.depth < TASK_MAX_DEPTH &&
        (view.isSummary || view.actualStart == null),
      copy: create,
      recordProgress: update && leaf,
      markCompleted: update && leaf && view.pct < FULL_PCT,
      rebaseline:
        update && leaf && view.startDate != null && view.dueDate != null,
    };
  }

  private async names(
    workspaceId: string,
    rows: readonly TaskRow[],
    extraUserIds: readonly string[] = [],
  ): Promise<TrackingNames> {
    return this.deps.directory.names(this.deps.db, workspaceId, {
      memberIds: [...new Set(rows.flatMap((row) => row.assigneeIds))],
      departmentIds: [
        ...new Set(rows.flatMap((row) => row.departmentId ?? [])),
      ],
      contractorIds: [
        ...new Set(rows.flatMap((row) => row.contractorId ?? [])),
      ],
      unitIds: [...new Set(rows.flatMap((row) => row.totalWorkUnitId ?? []))],
      tagIds: [...new Set(rows.flatMap((row) => row.tagIds))],
      userIds: [
        ...new Set([...rows.map((row) => row.createdBy), ...extraUserIds]),
      ],
    });
  }

  private readModel(
    access: MemberAccess,
    view: TaskView,
    names: TrackingNames,
    flags: { contextOnly: boolean; matched: boolean },
  ): TaskReadModel {
    const named = (map: ReadonlyMap<string, string>, id: string | null) =>
      id == null ? null : { id, name: map.get(id) ?? null };
    const financial = can(access, TASK_MENU, "financial", {
      projectId: view.projectId,
    });
    return {
      ...view,
      totalPrice: financial ? view.totalPrice : null,
      totalPriceView: financial ? view.totalPriceView : null,
      completedPrice: financial ? view.completedPrice : null,
      financial,
      contextOnly: flags.contextOnly,
      matched: flags.matched,
      assignees: view.assigneeIds.map((id) => ({
        id,
        name: names.members.get(id) ?? null,
      })),
      department: named(names.departments, view.departmentId),
      contractor: named(names.contractors, view.contractorId),
      tags: view.tagIds.map((id) => ({ id, name: names.tags.get(id) ?? null })),
      unit: named(names.units, view.totalWorkUnitId),
      createdByName: names.users.get(view.createdBy) ?? null,
      actions: this.actionsFor(access, view, flags.contextOnly),
    };
  }

  /**
   * The rows a list or the Gantt shows: tasks matching the filters that
   * the viewer may see, and their ancestors for context, in tree order.
   */
  private async rows(
    access: MemberAccess,
    projectId: string,
    filters: Omit<TaskFilter, "today" | "workspaceId" | "projectId">,
  ): Promise<{
    all: TaskRow[];
    shown: TaskRow[];
    views: Map<string, TaskView>;
    own: Set<string>;
    matched: Set<string>;
  }> {
    const { db, store } = this.deps;
    const workspaceId = access.workspaceId;
    const today = await this.deps.today(workspaceId);
    const [all, viewer] = await Promise.all([
      store.projectTasks(db, workspaceId, projectId),
      this.viewer(access, projectId),
    ]);
    const filtered = Object.values(filters).some(
      (value: unknown) => value != null && value !== "",
    );
    const hits = filtered
      ? await store.matching(db, { ...filters, workspaceId, projectId, today })
      : null;
    const visibility = taskVisibility(all, viewer);
    const matched = new Set(
      all
        .filter(
          (row) =>
            visibility.own.has(row.id) && (hits == null || hits.has(row.id)),
        )
        .map((row) => row.id),
    );
    const byId = new Map(all.map((row) => [row.id, row]));
    const shownIds = new Set(matched);
    for (const id of matched) {
      let parentId = byId.get(id)?.parentId ?? null;
      while (parentId != null) {
        shownIds.add(parentId);
        parentId = byId.get(parentId)?.parentId ?? null;
      }
    }
    const shown = treeOrder(all.filter((row) => shownIds.has(row.id)));
    return {
      all,
      shown,
      views: taskViews(all, today),
      own: visibility.own,
      matched,
    };
  }

  /**
   * A Project's task tree (CM-0019 §2, §5): a page of top-level tasks in
   * their order, each followed by its sub-tasks; filters match any level
   * and bring the ancestors along. Without View all, only the viewer's own
   * and assigned tasks match, with their ancestors as context.
   */
  async list(access: MemberAccess, params: TaskListParams): Promise<TaskPage> {
    const { limit, after, before, projectId, ...filters } = params;
    const { shown, views, own, matched } = await this.rows(
      access,
      projectId,
      filters,
    );
    const roots = shown.filter((row) => row.parentId == null);
    let page: TaskRow[];
    let hasMore: boolean;
    if (before != null) {
      const cursor = decodeCursor(before);
      const earlier = roots.filter((row) => rootOrder(row, cursor) < 0);
      page = earlier.slice(-limit);
      hasMore = earlier.length > limit;
    } else {
      const cursor = after == null ? null : decodeCursor(after);
      const later =
        cursor == null
          ? roots
          : roots.filter((row) => rootOrder(row, cursor) > 0);
      page = later.slice(0, limit);
      hasMore = later.length > limit;
    }
    const pageRoots = new Set(page.map((row) => row.id));
    const rootOf = new Map<string, string>();
    for (const row of shown)
      rootOf.set(
        row.id,
        row.parentId == null ? row.id : (rootOf.get(row.parentId) ?? row.id),
      );
    const rows = shown.filter((row) => pageRoots.has(rootOf.get(row.id) ?? ""));
    const names = await this.names(access.workspaceId, rows);
    const items = rows.flatMap((row) => {
      const view = views.get(row.id);
      return view == null
        ? []
        : [
            this.readModel(access, view, names, {
              contextOnly: !own.has(row.id),
              matched: matched.has(row.id),
            }),
          ];
    });
    const first = page[0];
    const last = page.at(-1);
    const backwards = before != null;
    const moreAfter = backwards || hasMore;
    const moreBefore = backwards ? hasMore : after != null;
    return {
      items,
      nextCursor: moreAfter && last != null ? encodeCursor(last) : null,
      prevCursor: moreBefore && first != null ? encodeCursor(first) : null,
      total: matched.size,
    };
  }

  /** Every row of the tree for the Gantt (CM-0019 §12), with the same filters and scoping. */
  async gantt(
    access: MemberAccess,
    params: Omit<TaskListParams, "limit" | "after" | "before">,
  ): Promise<{ items: TaskReadModel[]; today: CalendarDate }> {
    const { projectId, ...filters } = params;
    const { shown, views, own, matched } = await this.rows(
      access,
      projectId,
      filters,
    );
    const names = await this.names(access.workspaceId, shown);
    return {
      items: shown.flatMap((row) => {
        const view = views.get(row.id);
        return view == null
          ? []
          : [
              this.readModel(access, view, names, {
                contextOnly: !own.has(row.id),
                matched: matched.has(row.id),
              }),
            ];
      }),
      today: await this.deps.today(access.workspaceId),
    };
  }

  /** One task the viewer may open, with its sub-tasks (rolled up) and baseline history. */
  async get(access: MemberAccess, id: string): Promise<TaskDetailModel> {
    const { db, store } = this.deps;
    const task = await this.findVisible(access, id);
    const today = await this.deps.today(access.workspaceId);
    const all = await store.projectTasks(
      db,
      access.workspaceId,
      task.projectId,
    );
    const views = taskViews(all, today);
    const viewer = await this.viewer(access, task.projectId);
    const visibility = taskVisibility(all, viewer);
    const view = views.get(id);
    if (view == null) throw taskNotFound();
    const byId = new Map(all.map((row) => [row.id, row]));
    const children = (childrenByParent(all).get(id) ?? []).filter(
      (row) =>
        visibility.own.has(row.id) ||
        descendantsOf(childrenByParent(all), row.id).some((d) =>
          visibility.own.has(d.id),
        ),
    );
    const parents: TaskDetailModel["parents"] = [];
    let parentId = task.parentId;
    while (parentId != null) {
      const parent = byId.get(parentId);
      if (parent == null) break;
      parents.unshift({
        id: parent.id,
        taskNo: parent.taskNo,
        name: parent.name,
      });
      parentId = parent.parentId;
    }
    const baselines = await store.baselines(db, id);
    const names = await this.names(
      access.workspaceId,
      [task, ...children],
      baselines.map((row) => row.createdBy),
    );
    return {
      ...this.readModel(access, view, names, {
        contextOnly: false,
        matched: true,
      }),
      parents,
      children: children.flatMap((row) => {
        const child = views.get(row.id);
        return child == null
          ? []
          : [
              this.readModel(access, child, names, {
                contextOnly: !visibility.own.has(row.id),
                matched: true,
              }),
            ];
      }),
      baselines: view.isSummary
        ? []
        : baselines.map((row) => ({
            ...row,
            createdByName: names.users.get(row.createdBy) ?? null,
          })),
    };
  }

  /** A task's live progress updates, newest first, with who recorded them. */
  async progressList(
    access: MemberAccess,
    taskId: string,
  ): Promise<ProgressReadModel[]> {
    const { db, store, directory } = this.deps;
    const task = await this.findVisible(access, taskId);
    const rows = (await store.progress(db, taskId)).reverse();
    const photos = await store.photos(
      db,
      access.workspaceId,
      taskId,
      rows.map((row) => row.id),
    );
    const names = await directory.names(db, access.workspaceId, {
      userIds: [
        ...new Set([
          ...rows.map((row) => row.createdBy),
          ...[...photos.values()].flat().map((file) => file.createdBy),
        ]),
      ],
    });
    return rows.map((row) => ({
      ...row,
      createdByName: names.users.get(row.createdBy) ?? null,
      photos: photos.get(row.id) ?? [],
      photoNames: names.users,
      actions: this.progressActions(access, task.projectId, row),
    }));
  }

  /** The activity feed, newest first (at most `limit`). */
  async activityList(
    access: MemberAccess,
    taskId: string,
    limit = 200,
  ): Promise<ActivityReadModel[]> {
    const { db, store, directory } = this.deps;
    await this.findVisible(access, taskId);
    const rows = await store.activities(db, taskId, limit);
    const memberIds = rows.flatMap((row) =>
      row.kind === "assignees_changed" && row.payload != null
        ? [
            ...((row.payload["added"] as string[] | undefined) ?? []),
            ...((row.payload["removed"] as string[] | undefined) ?? []),
          ]
        : [],
    );
    const names = await directory.names(db, access.workspaceId, {
      userIds: [...new Set(rows.map((row) => row.createdBy))],
      memberIds: [...new Set(memberIds)],
    });
    return rows.map((row) => ({
      ...row,
      createdByName: names.users.get(row.createdBy) ?? null,
      memberNames: Object.fromEntries(names.members),
    }));
  }

  /** What the task form and the list's filters offer on the Project. */
  async formOptions(
    workspaceId: string,
    projectId: string,
  ): Promise<TaskFormOptions> {
    const options = await this.deps.directory.options(
      this.deps.db,
      workspaceId,
      projectId,
      ["members", "departments", "contractors", "units", "tags"],
    );
    return {
      members: options.members,
      departments: options.departments.map(({ id, name }) => ({ id, name })),
      contractors: options.contractors.map(({ id, name, departmentIds }) => ({
        id,
        name,
        departmentIds,
      })),
      units: options.units.map(({ id, name }) => ({ id, name })),
      tags: options.tags.map(({ id, name }) => ({ id, name })),
    };
  }
}
