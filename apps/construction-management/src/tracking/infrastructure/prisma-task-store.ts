import { Prisma } from "@repo/construction-db";

import {
  calendarDateFromDb,
  calendarDateToDb,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { newId } from "@/src/shared-kernel/ids";
import {
  storedLocationRef,
  type LocationRef,
} from "@/src/shared-kernel/location-ref";
import { tombstone } from "@/src/shared-kernel/tombstone";

import type { TrackingTx } from "../application/ports";
import {
  attachEntryFiles,
  entryFiles,
  tombstoneEntryFiles,
} from "./entry-files";
import { recomputeTaskAndAncestors } from "../application/task-recompute";
import type {
  ActivityRow,
  BaselineRow,
  ProgressRow,
  TaskActivityKind,
  TaskContent,
  TaskFilter,
  TaskRow,
  TaskStore,
} from "../application/task-store";
import {
  percentFromDb,
  percentText,
  quantityFromDb,
  quantityText,
} from "../domain/task-progress";
import { taskDueSql, taskStartSql, taskStatusSql } from "./task-status-sql";

const INCLUDE = {
  assignees: { select: { memberId: true } },
  tags: { select: { tagId: true } },
} as const;

type Row = Prisma.ConstructionTrackingTaskGetPayload<{
  include: typeof INCLUDE;
}>;

const day = (value: Date | null): CalendarDate | null =>
  value == null ? null : calendarDateFromDb(value);

const dbDay = (value: CalendarDate | null): Date | null =>
  value == null ? null : calendarDateToDb(value);

function locations(json: unknown): LocationRef[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((item) => storedLocationRef(item) ?? []);
}

function toRow(row: Row): TaskRow {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    taskNo: row.taskNo,
    parentId: row.parentId,
    depth: row.depth,
    sortOrder: row.sortOrder,
    name: row.name,
    description: row.description,
    startDate: day(row.startDate),
    dueDate: day(row.dueDate),
    priority: row.priority,
    siteLocation: storedLocationRef(row.siteLocation),
    extraLocations: locations(row.extraLocations),
    departmentId: row.departmentId,
    contractorId: row.contractorId,
    totalWorkMilli:
      row.totalWorkQty == null ? null : quantityFromDb(row.totalWorkQty),
    totalWorkUnitId: row.totalWorkUnitId,
    totalPrice: row.totalPrice,
    completedMilli: quantityFromDb(row.completedWorkQty),
    pct: percentFromDb(row.progressPct),
    actualStart: day(row.actualStart),
    actualEnd: day(row.actualEnd),
    baselineStart: day(row.baselineStart),
    baselineEnd: day(row.baselineEnd),
    baselineVersion: row.baselineVersion,
    copiedFromId: row.copiedFromId,
    assigneeIds: row.assignees.map((item) => item.memberId),
    tagIds: row.tags.map((item) => item.tagId),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

function columns(content: TaskContent) {
  return {
    name: content.name,
    description: content.description,
    startDate: dbDay(content.startDate),
    dueDate: dbDay(content.dueDate),
    priority: content.priority,
    siteLocationType: content.siteLocation?.type ?? null,
    // No location is left out and written as SQL NULL by `clearLocation`:
    // `next dev` turns `Prisma.DbNull` into `{}` (the M6 handoff).
    ...(content.siteLocation == null
      ? {}
      : { siteLocation: json(content.siteLocation) }),
    extraLocations: json(content.extraLocations),
    departmentId: content.departmentId,
    contractorId: content.contractorId,
    totalWorkQty:
      content.totalWorkMilli == null
        ? null
        : new Prisma.Decimal(quantityText(content.totalWorkMilli)),
    totalWorkUnitId: content.totalWorkUnitId,
    totalPrice: content.totalPrice,
  };
}

async function clearLocation(db: TrackingTx, id: string): Promise<void> {
  await db.$executeRaw(Prisma.sql`
    UPDATE construction_tracking.tasks SET site_location = NULL
    WHERE id = ${id}::uuid`);
}

type ProgressDb = Prisma.ConstructionTrackingTaskProgressGetPayload<object>;

function toProgress(row: ProgressDb): ProgressRow {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    taskId: row.taskId,
    progressDate: calendarDateFromDb(row.progressDate),
    workMilli: row.workQty == null ? null : quantityFromDb(row.workQty),
    pct: row.progressPct == null ? null : percentFromDb(row.progressPct),
    remark: row.remark,
    source: row.source,
    worksheetId: row.worksheetId,
    worksheetNumber: row.worksheetNumber,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

function progressFigures(values: {
  workMilli: bigint | null;
  pct: number | null;
}) {
  return {
    workQty:
      values.workMilli == null
        ? null
        : new Prisma.Decimal(quantityText(values.workMilli)),
    progressPct:
      values.pct == null ? null : new Prisma.Decimal(percentText(values.pct)),
  };
}

function filterSql(filter: TaskFilter): Prisma.Sql {
  const parts: Prisma.Sql[] = [
    Prisma.sql`t.workspace_id = ${filter.workspaceId}`,
    Prisma.sql`t.project_id = ${filter.projectId}::uuid`,
    Prisma.sql`t.deleted_at IS NULL`,
  ];
  if (filter.status != null)
    parts.push(
      Prisma.sql`${taskStatusSql("t", filter.today)} = ${filter.status}`,
    );
  if (filter.assigneeId != null)
    parts.push(Prisma.sql`EXISTS (
      SELECT 1 FROM construction_tracking.task_assignees a
      WHERE a.task_id = t.id AND a.member_id = ${filter.assigneeId}::uuid)`);
  if (filter.priority != null)
    parts.push(
      Prisma.sql`t.priority = ${filter.priority}::construction_tracking.priority`,
    );
  if (filter.tagId != null)
    parts.push(Prisma.sql`EXISTS (
      SELECT 1 FROM construction_tracking.task_tags g
      WHERE g.task_id = t.id AND g.tag_id = ${filter.tagId}::uuid)`);
  if (filter.departmentId != null)
    parts.push(Prisma.sql`t.department_id = ${filter.departmentId}::uuid`);
  if (filter.contractorId != null)
    parts.push(Prisma.sql`t.contractor_id = ${filter.contractorId}::uuid`);
  if (filter.locationId != null) {
    const id = filter.locationId;
    const names = (column: Prisma.Sql) =>
      Prisma.sql`(${column}->>'wingId' = ${id}
        OR ${column}->>'developmentId' = ${id}
        OR ${column}->>'locationId' = ${id})`;
    parts.push(Prisma.sql`(${names(Prisma.sql`t.site_location`)}
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(t.extra_locations) = 'array'
          THEN t.extra_locations ELSE '[]'::jsonb END) AS extra(ref)
        WHERE ${names(Prisma.sql`extra.ref`)}))`);
  }
  if (filter.from != null || filter.to != null) {
    const start = taskStartSql("t");
    const due = taskDueSql("t");
    parts.push(Prisma.sql`(${start} IS NOT NULL OR ${due} IS NOT NULL)`);
    if (filter.to != null)
      parts.push(Prisma.sql`COALESCE(${start}, ${due}) <= ${filter.to}::date`);
    if (filter.from != null)
      parts.push(
        Prisma.sql`COALESCE(${due}, ${start}) >= ${filter.from}::date`,
      );
  }
  const search = filter.search?.trim() ?? "";
  if (search !== "") {
    const number = /^(?:t-?)?(\d{1,9})$/i.exec(search);
    const like = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    parts.push(
      number == null
        ? Prisma.sql`t.name ILIKE ${like}`
        : Prisma.sql`(t.task_no = ${Number(number[1])} OR t.name ILIKE ${like})`,
    );
  }
  return Prisma.join(parts, " AND ");
}

/** Tasks on Prisma (CM-802). */
export const prismaTaskStore: TaskStore = {
  async projectTasks(db, workspaceId, projectId) {
    const rows = await db.constructionTrackingTask.findMany({
      where: { workspaceId, projectId, deletedAt: null },
      include: INCLUDE,
      orderBy: [{ depth: "asc" }, { sortOrder: "asc" }, { taskNo: "asc" }],
    });
    return rows.map(toRow);
  },

  async find(db, workspaceId, id) {
    const row = await db.constructionTrackingTask.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: INCLUDE,
    });
    return row == null ? null : toRow(row);
  },

  async findMany(db, workspaceId, ids) {
    if (ids.length === 0) return [];
    const rows = await db.constructionTrackingTask.findMany({
      where: { id: { in: [...ids] }, workspaceId, deletedAt: null },
      include: INCLUDE,
    });
    return rows.map(toRow);
  },

  async lock(db, workspaceId, ids) {
    if (ids.length === 0) return [];
    const locked = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM construction_tracking.tasks
      WHERE id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
        AND workspace_id = ${workspaceId} AND deleted_at IS NULL
      ORDER BY depth, id
      FOR UPDATE`);
    const rows = await prismaTaskStore.findMany(
      db,
      workspaceId,
      locked.map((row) => row.id),
    );
    return rows.sort((a, b) => a.depth - b.depth);
  },

  async chain(db, id) {
    const out: TaskRow[] = [];
    let next: string | null = id;
    while (next != null && out.length < 4) {
      const row: Row | null = await db.constructionTrackingTask.findFirst({
        where: { id: next, deletedAt: null },
        include: INCLUDE,
      });
      if (row == null) break;
      out.push(toRow(row));
      next = row.parentId;
    }
    return out;
  },

  async descendants(db, id) {
    const children = await db.constructionTrackingTask.findMany({
      where: { parentId: id, deletedAt: null },
      include: INCLUDE,
    });
    if (children.length === 0) return [];
    const grandchildren = await db.constructionTrackingTask.findMany({
      where: {
        parentId: { in: children.map((row) => row.id) },
        deletedAt: null,
      },
      include: INCLUDE,
    });
    return [...children, ...grandchildren].map(toRow);
  },

  async matching(db, filter) {
    const rows = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT t.id FROM construction_tracking.tasks t
      WHERE ${filterSql(filter)}`);
    return new Set(rows.map((row) => row.id));
  },

  async allocateNumbers(db, workspaceId, projectId, count) {
    const [row] = await db.$queryRaw<{ last_no: number }[]>(Prisma.sql`
      INSERT INTO construction_tracking.task_counters
        (project_id, workspace_id, last_no, updated_at)
      VALUES (${projectId}::uuid, ${workspaceId}, ${count}, now())
      ON CONFLICT (project_id) DO UPDATE
        SET last_no = construction_tracking.task_counters.last_no + ${count},
            updated_at = now()
      RETURNING last_no`);
    return (row?.last_no ?? count) - count + 1;
  },

  async nextSortOrder(db, projectId, parentId) {
    const result = await db.constructionTrackingTask.aggregate({
      where: { projectId, parentId, deletedAt: null },
      _max: { sortOrder: true },
    });
    return (result._max.sortOrder ?? 0) + 1;
  },

  async shiftSiblings(db, projectId, parentId, sortOrder, by) {
    await db.constructionTrackingTask.updateMany({
      where: {
        projectId,
        parentId,
        deletedAt: null,
        sortOrder: { gt: sortOrder },
      },
      data: { sortOrder: { increment: by } },
    });
  },

  async insert(db, row) {
    await db.constructionTrackingTask.create({
      data: {
        id: row.id,
        workspaceId: row.workspaceId,
        projectId: row.projectId,
        taskNo: row.taskNo,
        parentId: row.parentId,
        depth: row.depth,
        sortOrder: row.sortOrder,
        copiedFromId: row.copiedFromId,
        ...columns(row),
        assignees: {
          create: row.assigneeIds.map((memberId) => ({ memberId })),
        },
        tags: { create: row.tagIds.map((tagId) => ({ tagId })) },
        createdAt: row.at,
        updatedAt: row.at,
        createdBy: row.by,
        updatedBy: row.by,
      },
    });
  },

  async replace(db, id, content) {
    await db.constructionTrackingTask.update({
      where: { id },
      data: {
        ...columns(content),
        updatedAt: content.at,
        updatedBy: content.by,
      },
    });
    if (content.siteLocation == null) await clearLocation(db, id);
    await db.constructionTrackingTaskAssignee.deleteMany({
      where: {
        taskId: id,
        memberId: { notIn: [...content.assigneeIds] },
      },
    });
    await db.constructionTrackingTaskAssignee.createMany({
      data: content.assigneeIds.map((memberId) => ({ taskId: id, memberId })),
      skipDuplicates: true,
    });
    await db.constructionTrackingTaskTag.deleteMany({
      where: { taskId: id, tagId: { notIn: [...content.tagIds] } },
    });
    await db.constructionTrackingTaskTag.createMany({
      data: content.tagIds.map((tagId) => ({ taskId: id, tagId })),
      skipDuplicates: true,
    });
  },

  async setCached(db, id, cached) {
    await db.constructionTrackingTask.update({
      where: { id },
      data: {
        completedWorkQty: new Prisma.Decimal(
          quantityText(cached.completedMilli),
        ),
        progressPct: new Prisma.Decimal(percentText(cached.pct)),
        actualStart: dbDay(cached.actualStart),
        actualEnd: dbDay(cached.actualEnd),
      },
    });
  },

  async tombstone(db, ids, by, at) {
    if (ids.length === 0) return;
    await db.constructionTrackingTask.updateMany({
      where: { id: { in: [...ids] }, deletedAt: null },
      data: tombstone(by, at),
    });
  },

  async addBaseline(db, row) {
    await db.constructionTrackingTaskBaseline.create({
      data: {
        id: newId(row.at.getTime()),
        workspaceId: row.workspaceId,
        taskId: row.taskId,
        version: row.version,
        startDate: calendarDateToDb(row.startDate),
        endDate: calendarDateToDb(row.endDate),
        reason: row.reason,
        createdAt: row.at,
        createdBy: row.by,
      },
    });
    await db.constructionTrackingTask.update({
      where: { id: row.taskId },
      data: {
        baselineStart: calendarDateToDb(row.startDate),
        baselineEnd: calendarDateToDb(row.endDate),
        baselineVersion: row.version,
      },
    });
  },

  async baselines(db, taskId) {
    const rows = await db.constructionTrackingTaskBaseline.findMany({
      where: { taskId },
      orderBy: { version: "desc" },
    });
    return rows.map((row): BaselineRow => ({
      id: row.id,
      version: row.version,
      startDate: calendarDateFromDb(row.startDate),
      endDate: calendarDateFromDb(row.endDate),
      reason: row.reason,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
    }));
  },

  async progress(db, taskId) {
    const rows = await db.constructionTrackingTaskProgress.findMany({
      where: { taskId, deletedAt: null },
      orderBy: [{ progressDate: "asc" }, { createdAt: "asc" }],
    });
    return rows.map(toProgress);
  },

  async findProgress(db, workspaceId, id) {
    const row = await db.constructionTrackingTaskProgress.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    return row == null ? null : toProgress(row);
  },

  async insertProgress(db, row) {
    await db.constructionTrackingTaskProgress.create({
      data: {
        id: row.id,
        workspaceId: row.workspaceId,
        taskId: row.taskId,
        progressDate: calendarDateToDb(row.progressDate),
        ...progressFigures(row),
        remark: row.remark,
        source: row.worksheet == null ? "manual" : "worksheet",
        worksheetId: row.worksheet?.id ?? null,
        worksheetNumber: row.worksheet?.number ?? null,
        createdAt: row.at,
        updatedAt: row.at,
        createdBy: row.by,
        updatedBy: row.by,
      },
    });
  },

  async worksheetProgress(db, workspaceId, worksheetId) {
    const row = await db.constructionTrackingTaskProgress.findFirst({
      where: { workspaceId, worksheetId, deletedAt: null },
    });
    return row == null ? null : toProgress(row);
  },

  async updateProgress(db, id, values) {
    await db.constructionTrackingTaskProgress.update({
      where: { id },
      data: {
        progressDate: calendarDateToDb(values.progressDate),
        ...progressFigures(values),
        remark: values.remark,
        updatedAt: values.at,
        updatedBy: values.by,
      },
    });
  },

  async tombstoneProgress(db, id, by, at) {
    await db.constructionTrackingTaskProgress.update({
      where: { id },
      data: tombstone(by, at),
    });
  },

  async progressCounts(db, taskIds) {
    if (taskIds.length === 0) return new Map();
    const rows = await db.constructionTrackingTaskProgress.groupBy({
      by: ["taskId"],
      where: { taskId: { in: [...taskIds] }, deletedAt: null },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.taskId, row._count._all]));
  },

  attachPhotos(db, input) {
    return attachEntryFiles(db, {
      workspaceId: input.workspaceId,
      type: "task",
      documentId: input.taskId,
      entryId: input.progressId,
      fileIds: input.fileIds,
      by: input.by,
    });
  },

  photos(db, workspaceId, taskId, progressIds) {
    return entryFiles(db, {
      workspaceId,
      type: "task",
      documentId: taskId,
      entryIds: progressIds,
    });
  },

  removePhotos(db, input) {
    return tombstoneEntryFiles(db, {
      workspaceId: input.workspaceId,
      type: "task",
      documentId: input.taskId,
      ...(input.progressId == null ? {} : { entryId: input.progressId }),
      by: input.by,
      at: input.at,
    });
  },

  async addActivities(db, workspaceId, by, at, rows) {
    if (rows.length === 0) return;
    await db.constructionTrackingTaskActivity.createMany({
      data: rows.map((row) => ({
        id: newId(at.getTime()),
        workspaceId,
        taskId: row.taskId,
        kind: row.kind,
        ...(row.payload == null ? {} : { payload: json(row.payload) }),
        createdAt: at,
        createdBy: by,
      })),
    });
  },

  async activities(db, taskId, limit) {
    const rows = await db.constructionTrackingTaskActivity.findMany({
      where: { taskId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
    });
    return rows.map((row): ActivityRow => ({
      id: row.id,
      taskId: row.taskId,
      kind: row.kind as TaskActivityKind,
      payload:
        typeof row.payload === "object" &&
        row.payload != null &&
        !Array.isArray(row.payload)
          ? (row.payload as Record<string, unknown>)
          : null,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
    }));
  },
};

/**
 * Recomputes a task's cached figures and every ancestor's on Prisma, in
 * the caller's transaction (CM-0019 §3, §4): what CM-806's worksheet
 * posting calls after it changes a task's progress rows.
 */
export function recomputeTaskInPrisma(tx: TrackingTx, taskId: string) {
  return recomputeTaskAndAncestors(tx, taskId, prismaTaskStore);
}
