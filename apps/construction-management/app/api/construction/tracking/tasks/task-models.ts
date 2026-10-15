import { z } from "zod";

import { toTrackingEntryFileResponse } from "@/app/api/construction/tracking/documents/document-responses";
import { ConstructionTrackingDocumentFileResponseModel } from "@/app/api/construction/tracking/documents/document-models";

import {
  ConstructionProcurementSiteLocationModel,
  ConstructionProcurementSiteLocationResponseModel,
} from "@/app/api/construction/procurement/purchase-requests/purchase-request-models";
import type {
  ActivityReadModel,
  ProgressReadModel,
  TaskDetailModel,
  TaskFormOptions,
  TaskReadModel,
} from "@/src/tracking/application/task-handlers";
import { TASK_ACTIVITY_KINDS } from "@/src/tracking/application/task-store";
import { TASK_LIMITS } from "@/src/tracking/domain/task";
import {
  percentValue,
  quantityText,
  TASK_STATUSES,
} from "@/src/tracking/domain/task-progress";
import { TRACKING_PRIORITIES } from "@/src/tracking/domain/tracking-documents";

export const TASKS_PATH = "/api/construction/tracking/tasks";

const priority = z.enum(
  TRACKING_PRIORITIES.map((item) => item.key) as [
    "high" | "medium" | "low",
    ...("high" | "medium" | "low")[],
  ],
);
const status = z.enum(TASK_STATUSES);
/** A quantity as a decimal string, at most three decimals. */
const quantity = z.union([z.string().trim().max(20), z.number().positive()]);
/** Paise, a whole number. */
const paise = z.int().nonnegative();
type SiteLocation = z.infer<
  typeof ConstructionProcurementSiteLocationResponseModel
>;

const TaskBody = z.object({
  name: z.string().max(TASK_LIMITS.name + 50),
  description: z
    .string()
    .max(TASK_LIMITS.description + 50)
    .nullable()
    .optional(),
  /** Team Member ids on the Project (Assign To). */
  assigneeIds: z.array(z.uuid()).max(TASK_LIMITS.assignees).optional(),
  /** Planned dates, `YYYY-MM-DD`; Due on or after Start. Ignored on a summary task. */
  startDate: z.iso.date().nullable().optional(),
  dueDate: z.iso.date().nullable().optional(),
  priority: priority.nullable().optional(),
  /** The main place on the Project. */
  siteLocation: ConstructionProcurementSiteLocationModel.nullable().optional(),
  /** Further places of the main one's Location Type (and Wing). */
  extraLocations: z
    .array(ConstructionProcurementSiteLocationModel)
    .max(TASK_LIMITS.extraLocations)
    .optional(),
  /** An enabled Department. */
  departmentId: z.uuid().nullable().optional(),
  /** An active Contractor assigned to the Project. */
  contractorId: z.uuid().nullable().optional(),
  tagIds: z.array(z.uuid()).max(TASK_LIMITS.tags).optional(),
  /** "Total work": above 0, with its unit. Leaf tasks only. */
  totalWorkQty: quantity.nullable().optional(),
  /** An enabled Measurement Unit; required with a quantity. */
  totalWorkUnitId: z.uuid().nullable().optional(),
  /** "Total Price" in paise. Ignored without Task Financial and on a summary task. */
  totalPrice: paise.nullable().optional(),
});

export const CreateConstructionTrackingTaskRequestModel = TaskBody.extend({
  projectId: z.uuid(),
  /** Add Sub-Task: the task it goes under (three levels at most). */
  parentId: z.uuid().nullable().optional(),
});

export const UpdateConstructionTrackingTaskRequestModel = TaskBody.extend({
  /** The task's `updatedAt` as loaded; 409 `TASK_CHANGED` when stale. */
  expectedUpdatedAt: z.iso.datetime(),
});

export const DeleteConstructionTrackingTaskRequestModel = z.object({
  /** 409 `TASK_CHANGED` when stale; omit to skip the check. */
  expectedUpdatedAt: z.iso.datetime().optional(),
});

export const BulkDeleteConstructionTrackingTasksRequestModel = z.object({
  projectId: z.uuid(),
  ids: z.array(z.uuid()).min(1).max(TASK_LIMITS.bulk),
});

export const RebaselineConstructionTrackingTaskRequestModel = z.object({
  reason: z.string().max(TASK_LIMITS.reason + 50),
  expectedUpdatedAt: z.iso.datetime().optional(),
});

const ProgressBody = z.object({
  /** `YYYY-MM-DD`, not after the Company's today. */
  progressDate: z.iso.date(),
  /** Quantity tasks: work done in this update, in the task's unit. */
  workQty: quantity.nullable().optional(),
  /** Percent tasks: the new percentage, 0–100. */
  progressPct: z
    .union([z.number(), z.string().max(10)])
    .nullable()
    .optional(),
  remark: z
    .string()
    .max(TASK_LIMITS.remark + 50)
    .nullable()
    .optional(),
  /** Photos uploaded to the task first (`…/documents/task/{id}/files`), at most 10. */
  fileIds: z.array(z.uuid()).max(10).optional(),
});

export const RecordConstructionTrackingTaskProgressRequestModel = ProgressBody;

export const UpdateConstructionTrackingTaskProgressRequestModel =
  ProgressBody.extend({ expectedUpdatedAt: z.iso.datetime() });

export const CompleteConstructionTrackingTaskRequestModel = z.object({
  /** Today when left out. */
  progressDate: z.iso.date().nullable().optional(),
  remark: z
    .string()
    .max(TASK_LIMITS.remark + 50)
    .nullable()
    .optional(),
  /** Photos uploaded to the task first, at most 10. */
  fileIds: z.array(z.uuid()).max(10).optional(),
});

export const ConstructionTrackingTaskParamsModel = z.object({ id: z.uuid() });
export const ConstructionTrackingTaskProgressParamsModel = z.object({
  progressId: z.uuid(),
});

export const GetConstructionTrackingTaskFormOptionsRequestModel = z.object({
  projectId: z.uuid(),
});

const TaskFilters = z.object({
  projectId: z.uuid(),
  status: status.optional(),
  /** A Team Member id among the assignees. */
  assigneeId: z.uuid().optional(),
  priority: priority.optional(),
  tagId: z.uuid().optional(),
  departmentId: z.uuid().optional(),
  contractorId: z.uuid().optional(),
  /** A Wing, Amenity, Common Development or Location id. */
  locationId: z.uuid().optional(),
  /** Planned span overlapping `from`–`to`. */
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  /** Task No. (`12`, `T-12`) or part of the name. */
  search: z.string().trim().max(100).optional(),
});

export const ListConstructionTrackingTasksRequestModel = TaskFilters.extend({
  /** Top-level tasks per page; each comes with its sub-tasks. */
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  after: z.string().min(1).optional(),
  before: z.string().min(1).optional(),
}).refine((value) => value.after == null || value.before == null, {
  message: "after and before are mutually exclusive.",
  path: ["after"],
});

export const GetConstructionTrackingTaskGanttRequestModel = TaskFilters;

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

const named = z.object({ id: z.uuid(), name: z.string().nullable() });

export const ConstructionTrackingTaskActionsResponseModel = z.object({
  edit: z.boolean(),
  delete: z.boolean(),
  /** Create, below three levels, and not on a leaf with progress. */
  addSubTask: z.boolean(),
  copy: z.boolean(),
  /** Update, on a leaf task. */
  recordProgress: z.boolean(),
  markCompleted: z.boolean(),
  /** Update, on a leaf task with both planned dates. */
  rebaseline: z.boolean(),
});

export const ConstructionTrackingTaskResponseModel = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  taskNo: z.int(),
  /** `T-12`. */
  label: z.string(),
  parentId: z.uuid().nullable(),
  /** 1 = top level … 3. */
  depth: z.int(),
  sortOrder: z.int(),
  name: z.string(),
  description: z.string().nullable(),
  /** Has live sub-tasks: dates, price and progress roll up. */
  isSummary: z.boolean(),
  childCount: z.int(),
  /** Sub-tasks and theirs (what a delete takes along). */
  descendantCount: z.int(),
  assignees: z.array(named),
  /** Planned dates; a summary's are its leaves' span. */
  startDate: z.iso.date().nullable(),
  dueDate: z.iso.date().nullable(),
  plannedDuration: z.int().nullable(),
  priority: priority.nullable(),
  siteLocation: ConstructionProcurementSiteLocationResponseModel.nullable(),
  extraLocations: z.array(ConstructionProcurementSiteLocationResponseModel),
  department: named.nullable(),
  contractor: named.nullable(),
  tags: z.array(named),
  /** `quantity` (Total work), `percent`, or null for a summary task. */
  kind: z.enum(["quantity", "percent"]).nullable(),
  /** Decimal string in `unit`. */
  totalWorkQty: z.string().nullable(),
  unit: named.nullable(),
  /** Σ of the updates; may pass the total (an overrun). */
  completedWorkQty: z.string().nullable(),
  /** 0–100, two decimals. */
  progressPct: z.number(),
  status,
  /** How a summary task weighs its sub-tasks; null for a leaf. */
  weighting: z.enum(["price", "duration"]).nullable(),
  /** Paise; null without Task Financial or without a price. */
  totalPrice: z.int().nullable(),
  /** Earned value in paise; null without Task Financial or without a price. */
  completedPrice: z.int().nullable(),
  /** The viewer holds Task Financial. */
  financial: z.boolean(),
  baselineStart: z.iso.date().nullable(),
  baselineEnd: z.iso.date().nullable(),
  baselineDuration: z.int().nullable(),
  baselineVersion: z.int(),
  /** Days, positive is late. */
  variance: z.int().nullable(),
  actualStart: z.iso.date().nullable(),
  actualEnd: z.iso.date().nullable(),
  /** An ancestor shown for the tree's sake: greyed, not openable. */
  contextOnly: z.boolean(),
  /** Matches the filters (false for ancestors shown as context). */
  matched: z.boolean(),
  createdBy: z.object({ userId: z.string(), name: z.string().nullable() }),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  actions: ConstructionTrackingTaskActionsResponseModel,
});
export type ConstructionTrackingTaskResponse = z.infer<
  typeof ConstructionTrackingTaskResponseModel
>;

export const ConstructionTrackingTaskDetailResponseModel =
  ConstructionTrackingTaskResponseModel.extend({
    /** From the top level down to the parent. */
    parents: z.array(
      z.object({ id: z.uuid(), taskNo: z.int(), name: z.string() }),
    ),
    children: z.array(ConstructionTrackingTaskResponseModel),
    /** Every baseline, newest first (leaf tasks). */
    baselines: z.array(
      z.object({
        id: z.uuid(),
        version: z.int(),
        startDate: z.iso.date(),
        endDate: z.iso.date(),
        duration: z.int(),
        reason: z.string().nullable(),
        createdBy: z.object({
          userId: z.string(),
          name: z.string().nullable(),
        }),
        createdAt: z.iso.datetime(),
      }),
    ),
  });
export type ConstructionTrackingTaskDetailResponse = z.infer<
  typeof ConstructionTrackingTaskDetailResponseModel
>;

export const ListConstructionTrackingTasksResponseModel = z.object({
  /** Tree order: each top-level task followed by its sub-tasks. */
  items: z.array(ConstructionTrackingTaskResponseModel),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  /** Tasks matching the filters (context rows not counted). */
  total: z.int(),
});
export type ListConstructionTrackingTasksResponse = z.infer<
  typeof ListConstructionTrackingTasksResponseModel
>;

export const GetConstructionTrackingTaskGanttResponseModel = z.object({
  items: z.array(ConstructionTrackingTaskResponseModel),
  /** The Company's today, for the Today line. */
  today: z.iso.date(),
});
export type GetConstructionTrackingTaskGanttResponse = z.infer<
  typeof GetConstructionTrackingTaskGanttResponseModel
>;

export const ConstructionTrackingTaskCreatedResponseModel = z.object({
  id: z.uuid(),
});

export const BulkDeleteConstructionTrackingTasksResponseModel = z.object({
  /** Tasks deleted, sub-tasks included. */
  deleted: z.int(),
});

export const ConstructionTrackingTaskProgressResponseModel = z.object({
  id: z.uuid(),
  taskId: z.uuid(),
  progressDate: z.iso.date(),
  /** Quantity tasks: work done in this update. */
  workQty: z.string().nullable(),
  /** Percent tasks: the percentage it set. */
  progressPct: z.number().nullable(),
  remark: z.string().nullable(),
  /** `worksheet` rows are read-only here (CM-806). */
  source: z.enum(["manual", "worksheet"]),
  worksheet: z
    .object({ id: z.uuid(), number: z.string().nullable() })
    .nullable(),
  /** Photos posted with the update (images only), oldest first. */
  photos: z.array(ConstructionTrackingDocumentFileResponseModel),
  createdBy: z.object({ userId: z.string(), name: z.string().nullable() }),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  actions: z.object({ edit: z.boolean(), delete: z.boolean() }),
});
export type ConstructionTrackingTaskProgressResponse = z.infer<
  typeof ConstructionTrackingTaskProgressResponseModel
>;

export const ListConstructionTrackingTaskProgressResponseModel = z.object({
  /** Newest first. */
  items: z.array(ConstructionTrackingTaskProgressResponseModel),
});

export const ConstructionTrackingTaskActivityResponseModel = z.object({
  id: z.uuid(),
  kind: z.enum(TASK_ACTIVITY_KINDS),
  /** What changed; its shape depends on `kind`. */
  payload: z.record(z.string(), z.unknown()).nullable(),
  /** Team Member names an `assignees_changed` row names. */
  memberNames: z.record(z.string(), z.string()),
  createdBy: z.object({ userId: z.string(), name: z.string().nullable() }),
  createdAt: z.iso.datetime(),
});
export type ConstructionTrackingTaskActivityResponse = z.infer<
  typeof ConstructionTrackingTaskActivityResponseModel
>;

export const ListConstructionTrackingTaskActivityResponseModel = z.object({
  /** Newest first, at most 200. */
  items: z.array(ConstructionTrackingTaskActivityResponseModel),
});

export const GetConstructionTrackingTaskFormOptionsResponseModel = z.object({
  /** Active Team Members on the Project, the Owner included. */
  members: z.array(
    z.object({ id: z.uuid(), name: z.string(), isOwner: z.boolean() }),
  ),
  departments: z.array(z.object({ id: z.uuid(), name: z.string() })),
  /** Active Contractors assigned to the Project. */
  contractors: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      departmentIds: z.array(z.uuid()),
    }),
  ),
  units: z.array(z.object({ id: z.uuid(), name: z.string() })),
  tags: z.array(z.object({ id: z.uuid(), name: z.string() })),
});
export type GetConstructionTrackingTaskFormOptionsResponse = z.infer<
  typeof GetConstructionTrackingTaskFormOptionsResponseModel
>;

export const ImportConstructionTrackingTasksRequestModel = z.object({
  projectId: z.uuid(),
});

export const ImportConstructionTrackingTasksResponseModel = z.object({
  imported: z.int(),
});

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

const money = (value: bigint | null) => (value == null ? null : Number(value));

export function toTaskResponse(
  t: TaskReadModel,
): ConstructionTrackingTaskResponse {
  return {
    id: t.id,
    projectId: t.projectId,
    taskNo: t.taskNo,
    label: `T-${String(t.taskNo)}`,
    parentId: t.parentId,
    depth: t.depth,
    sortOrder: t.sortOrder,
    name: t.name,
    description: t.description,
    isSummary: t.isSummary,
    childCount: t.childCount,
    descendantCount: t.descendantCount,
    assignees: t.assignees,
    startDate: t.plannedStart,
    dueDate: t.plannedDue,
    plannedDuration: t.plannedDuration,
    priority: t.priority,
    siteLocation: t.siteLocation as SiteLocation | null,
    extraLocations: t.extraLocations as SiteLocation[],
    department: t.department,
    contractor: t.contractor,
    tags: t.tags,
    kind: t.isSummary
      ? null
      : t.totalWorkMilli == null
        ? "percent"
        : "quantity",
    totalWorkQty:
      t.isSummary || t.totalWorkMilli == null
        ? null
        : quantityText(t.totalWorkMilli),
    unit: t.isSummary ? null : t.unit,
    completedWorkQty:
      t.isSummary || t.totalWorkMilli == null
        ? null
        : quantityText(t.completedMilli),
    progressPct: percentValue(t.pct),
    status: t.status,
    weighting: t.weighting,
    totalPrice: money(t.totalPriceView),
    completedPrice: money(t.completedPrice),
    financial: t.financial,
    baselineStart: t.baselineStartView,
    baselineEnd: t.baselineEndView,
    baselineDuration: t.baselineDurationDays,
    baselineVersion: t.baselineVersion,
    variance: t.variance,
    actualStart: t.actualStart,
    actualEnd: t.actualEnd,
    contextOnly: t.contextOnly,
    matched: t.matched,
    createdBy: { userId: t.createdBy, name: t.createdByName },
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    actions: t.actions,
  };
}

export function toTaskDetailResponse(
  t: TaskDetailModel,
): ConstructionTrackingTaskDetailResponse {
  return {
    ...toTaskResponse(t),
    parents: t.parents,
    children: t.children.map(toTaskResponse),
    baselines: t.baselines.map((row) => ({
      id: row.id,
      version: row.version,
      startDate: row.startDate,
      endDate: row.endDate,
      duration:
        Math.round(
          (Date.parse(row.endDate) - Date.parse(row.startDate)) / 86_400_000,
        ) + 1,
      reason: row.reason,
      createdBy: { userId: row.createdBy, name: row.createdByName },
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

export function toProgressResponse(
  p: ProgressReadModel,
): ConstructionTrackingTaskProgressResponse {
  return {
    id: p.id,
    taskId: p.taskId,
    progressDate: p.progressDate,
    workQty: p.workMilli == null ? null : quantityText(p.workMilli),
    progressPct: p.pct == null ? null : percentValue(p.pct),
    remark: p.remark,
    source: p.source,
    worksheet:
      p.worksheetId == null
        ? null
        : { id: p.worksheetId, number: p.worksheetNumber },
    photos: p.photos.map((file) =>
      toTrackingEntryFileResponse(file, p.photoNames, p.actions.delete),
    ),
    createdBy: { userId: p.createdBy, name: p.createdByName },
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    actions: p.actions,
  };
}

export function toActivityResponse(
  a: ActivityReadModel,
): ConstructionTrackingTaskActivityResponse {
  return {
    id: a.id,
    kind: a.kind,
    payload: a.payload,
    memberNames: a.memberNames,
    createdBy: { userId: a.createdBy, name: a.createdByName },
    createdAt: a.createdAt.toISOString(),
  };
}

export function toTaskFormOptions(
  options: TaskFormOptions,
): GetConstructionTrackingTaskFormOptionsResponse {
  return {
    members: options.members.map((member) => ({
      id: member.id,
      name: member.name,
      isOwner: member.isOwner,
    })),
    departments: options.departments,
    contractors: options.contractors.map((contractor) => ({
      ...contractor,
      departmentIds: [...contractor.departmentIds],
    })),
    units: options.units,
    tags: options.tags,
  };
}
