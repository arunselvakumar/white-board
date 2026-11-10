import { mockApi, type ApiCall } from "../../../.storybook/mocks/api";
import type { TrackingAccessMenu } from "@/app/api/construction/tracking/access/access-models";
import { localToday } from "@/components/payments/payment-format";
import {
  mockTrackingDocumentApi,
  trackingFile,
  trackingSwatch,
} from "@/components/tracking/documents/tracking-document-fixtures";
import type { Flag } from "@/src/shared-kernel/access";
import { addDays } from "@/src/shared-kernel/calendar-date";
import type { LocationOptions } from "@/src/queries/location-options";
import type { TrackingAccess } from "@/src/queries/tracking-access";
import type {
  Task,
  TaskActivity,
  TaskDetail,
  TaskFormOptions,
  TaskPage,
  TaskProgress,
} from "@/src/queries/tracking-tasks";

/** Story fixtures for Tasks (CM-802). */

export const TASKS_API = "/api/construction/tracking/tasks";
export const TASK_PROJECT_ID = "0199c4a0-0000-7000-8000-0000000d0001";
export const WING_ID = "0199c4a0-0000-7000-8000-0000000d0101";
export const UNIT_ID = "0199c4a0-0000-7000-8000-0000000d0201";
export const KARTHIK = "0199c4a0-0000-7000-8000-0000000d0301";
export const PRABHU = "0199c4a0-0000-7000-8000-0000000d0302";
export const TAG_ID = "0199c4a0-0000-7000-8000-0000000d0401";
export const CONTRACTOR_ID = "0199c4a0-0000-7000-8000-0000000d0501";
export const DEPARTMENT_ID = "0199c4a0-0000-7000-8000-0000000d0601";

export const ROOT_ID = "0199c4a0-0000-7000-8000-0000000d1001";
export const COLUMNS_ID = "0199c4a0-0000-7000-8000-0000000d1002";
export const SLAB_ID = "0199c4a0-0000-7000-8000-0000000d1003";
export const PLASTER_ID = "0199c4a0-0000-7000-8000-0000000d1004";
export const PROGRESS_ID = "0199c4a0-0000-7000-8000-0000000d2001";

const TODAY = localToday();

const ALL_FLAGS: Flag[] = [
  "create",
  "read",
  "update",
  "delete",
  "view_all",
  "financial",
];

/** What the viewer may do in tracking (every flag unless narrowed). */
export function trackingAccess(
  projectId: string | null,
  flags: Partial<Record<TrackingAccessMenu, Flag[]>> = {},
): TrackingAccess {
  return {
    projectId: projectId ?? TASK_PROJECT_ID,
    menus: {
      "tracking.tasks": flags["tracking.tasks"] ?? ALL_FLAGS,
      "tracking.issues": flags["tracking.issues"] ?? ALL_FLAGS,
      "tracking.inspection_requests":
        flags["tracking.inspection_requests"] ?? ALL_FLAGS,
      "masters.tags": flags["masters.tags"] ?? ["create", "read"],
    },
  };
}

export const TASK_FORM_OPTIONS: TaskFormOptions = {
  members: [
    {
      id: "0199c4a0-0000-7000-8000-0000000d0300",
      name: "Arun Selva Kumar",
      isOwner: true,
    },
    { id: KARTHIK, name: "Karthik R", isOwner: false },
    { id: PRABHU, name: "Prabhu Saravanan", isOwner: false },
  ],
  departments: [{ id: DEPARTMENT_ID, name: "Civil" }],
  contractors: [
    {
      id: CONTRACTOR_ID,
      name: "Velan Constructions",
      departmentIds: [DEPARTMENT_ID],
    },
  ],
  units: [
    { id: UNIT_ID, name: "Cum" },
    { id: "0199c4a0-0000-7000-8000-0000000d0202", name: "Sqm" },
  ],
  tags: [{ id: TAG_ID, name: "Structure" }],
};

export const TASK_LOCATIONS: LocationOptions = {
  structure: "wings",
  types: ["wing"],
  wings: [
    {
      id: WING_ID,
      name: "Wing A",
      phaseName: "Phase 1",
      floors: [
        {
          id: "0199c4a0-0000-7000-8000-0000000d0111",
          name: "Ground Floor",
          kind: "ground",
          units: [],
        },
      ],
    },
  ],
  amenities: [],
  commonDevelopments: [],
  locations: [],
};

const ACTIONS: Task["actions"] = {
  edit: true,
  delete: true,
  addSubTask: true,
  copy: true,
  recordProgress: true,
  markCompleted: true,
  rebaseline: true,
};

/** A leaf task (Columns, a quantity task in progress) unless patched. */
export function task(extra: Partial<Task> = {}): Task {
  return {
    id: COLUMNS_ID,
    projectId: TASK_PROJECT_ID,
    taskNo: 2,
    label: "T-2",
    parentId: ROOT_ID,
    depth: 2,
    sortOrder: 1,
    name: "Ground floor columns",
    description: "Columns C1–C24 up to plinth",
    isSummary: false,
    childCount: 0,
    descendantCount: 0,
    assignees: [{ id: KARTHIK, name: "Karthik R" }],
    startDate: addDays(TODAY, -10),
    dueDate: addDays(TODAY, 5),
    plannedDuration: 16,
    priority: "high",
    siteLocation: {
      type: "wing",
      wingId: WING_ID,
      floorIds: [],
      unitIds: [],
    },
    extraLocations: [],
    department: { id: DEPARTMENT_ID, name: "Civil" },
    contractor: { id: CONTRACTOR_ID, name: "Velan Constructions" },
    tags: [{ id: TAG_ID, name: "Structure" }],
    kind: "quantity",
    totalWorkQty: "48",
    unit: { id: UNIT_ID, name: "Cum" },
    completedWorkQty: "18",
    progressPct: 37.5,
    status: "in_progress",
    weighting: null,
    totalPrice: 25_000_000,
    completedPrice: 9_375_000,
    financial: true,
    baselineStart: addDays(TODAY, -10),
    baselineEnd: addDays(TODAY, 2),
    baselineDuration: 13,
    baselineVersion: 1,
    variance: 3,
    actualStart: addDays(TODAY, -8),
    actualEnd: null,
    contextOnly: false,
    matched: true,
    createdBy: { userId: "user-owner", name: "Arun Selva Kumar" },
    createdAt: "2026-10-01T09:00:00.000Z",
    updatedAt: "2026-10-01T09:00:00.000Z",
    actions: ACTIONS,
    ...extra,
  };
}

export const TASKS: Task[] = [
  task({
    id: ROOT_ID,
    taskNo: 1,
    label: "T-1",
    parentId: null,
    depth: 1,
    name: "Tower A structure",
    description: null,
    isSummary: true,
    childCount: 2,
    descendantCount: 2,
    assignees: [],
    startDate: addDays(TODAY, -10),
    dueDate: addDays(TODAY, 20),
    plannedDuration: 31,
    kind: null,
    totalWorkQty: null,
    unit: null,
    completedWorkQty: null,
    progressPct: 23.08,
    weighting: "price",
    totalPrice: 65_000_000,
    completedPrice: 9_375_000,
    baselineEnd: addDays(TODAY, 18),
    baselineDuration: 29,
    actions: {
      ...ACTIONS,
      recordProgress: false,
      markCompleted: false,
      rebaseline: false,
    },
  }),
  task(),
  task({
    id: SLAB_ID,
    taskNo: 3,
    label: "T-3",
    sortOrder: 2,
    name: "First floor slab",
    description: null,
    assignees: [{ id: PRABHU, name: "Prabhu Saravanan" }],
    startDate: addDays(TODAY, 6),
    dueDate: addDays(TODAY, 20),
    plannedDuration: 15,
    priority: "medium",
    kind: "percent",
    totalWorkQty: null,
    unit: null,
    completedWorkQty: null,
    progressPct: 0,
    status: "not_started",
    totalPrice: 40_000_000,
    completedPrice: 0,
    baselineStart: addDays(TODAY, 6),
    baselineEnd: addDays(TODAY, 18),
    variance: 2,
    actualStart: null,
  }),
  task({
    id: PLASTER_ID,
    taskNo: 4,
    label: "T-4",
    parentId: null,
    depth: 1,
    sortOrder: 2,
    name: "External plastering",
    description: null,
    assignees: [],
    startDate: addDays(TODAY, -20),
    dueDate: addDays(TODAY, -2),
    plannedDuration: 19,
    priority: "low",
    kind: "percent",
    totalWorkQty: null,
    unit: null,
    completedWorkQty: null,
    progressPct: 60,
    status: "delayed",
    totalPrice: null,
    completedPrice: null,
    baselineStart: addDays(TODAY, -20),
    baselineEnd: addDays(TODAY, -2),
    variance: 2,
    actualStart: addDays(TODAY, -18),
  }),
];

export function taskDetail(extra: Partial<TaskDetail> = {}): TaskDetail {
  return {
    ...task(),
    parents: [{ id: ROOT_ID, taskNo: 1, name: "Tower A structure" }],
    children: [],
    baselines: [
      {
        id: "0199c4a0-0000-7000-8000-0000000d3001",
        version: 1,
        startDate: addDays(TODAY, -10),
        endDate: addDays(TODAY, 2),
        duration: 13,
        reason: null,
        createdBy: { userId: "user-owner", name: "Arun Selva Kumar" },
        createdAt: "2026-10-01T09:00:00.000Z",
      },
    ],
    ...extra,
  };
}

export const SUMMARY_DETAIL: TaskDetail = {
  ...(TASKS[0] ?? task()),
  parents: [],
  children: [TASKS[1] ?? task(), TASKS[2] ?? task()],
  baselines: [],
};

export const PROGRESS: TaskProgress[] = [
  {
    id: PROGRESS_ID,
    taskId: COLUMNS_ID,
    progressDate: addDays(TODAY, -1),
    workQty: "10",
    progressPct: null,
    remark: "C13–C18 cast",
    source: "manual",
    worksheet: null,
    photos: [
      trackingFile(
        "Columns cast.jpg",
        {
          entryId: PROGRESS_ID,
          thumbUrl: trackingSwatch("#94a3b8"),
          canRemove: true,
        },
        { type: "task", id: COLUMNS_ID },
      ),
    ],
    createdBy: { userId: "user-karthik", name: "Karthik R" },
    createdAt: "2026-10-12T09:00:00.000Z",
    updatedAt: "2026-10-12T09:00:00.000Z",
    actions: { edit: true, delete: true },
  },
  {
    id: "0199c4a0-0000-7000-8000-0000000d2002",
    taskId: COLUMNS_ID,
    progressDate: addDays(TODAY, -8),
    workQty: "8",
    progressPct: null,
    remark: null,
    source: "worksheet",
    worksheet: {
      id: "0199c4a0-0000-7000-8000-0000000d4001",
      number: "WS/26-27/00012",
    },
    photos: [],
    createdBy: { userId: "user-karthik", name: "Karthik R" },
    createdAt: "2026-10-05T09:00:00.000Z",
    updatedAt: "2026-10-05T09:00:00.000Z",
    actions: { edit: false, delete: false },
  },
];

export const ACTIVITY: TaskActivity[] = [
  {
    id: "0199c4a0-0000-7000-8000-0000000d5003",
    kind: "progress_recorded",
    payload: {
      progressDate: addDays(TODAY, -1),
      workQty: "10",
      taskProgressPct: 37.5,
    },
    memberNames: {},
    createdBy: { userId: "user-karthik", name: "Karthik R" },
    createdAt: "2026-10-12T09:00:00.000Z",
  },
  {
    id: "0199c4a0-0000-7000-8000-0000000d5002",
    kind: "assignees_changed",
    payload: { added: [KARTHIK], removed: [] },
    memberNames: { [KARTHIK]: "Karthik R" },
    createdBy: { userId: "user-owner", name: "Arun Selva Kumar" },
    createdAt: "2026-10-01T09:00:00.000Z",
  },
  {
    id: "0199c4a0-0000-7000-8000-0000000d5001",
    kind: "created",
    payload: { taskNo: 2, name: "Ground floor columns" },
    memberNames: {},
    createdBy: { userId: "user-owner", name: "Arun Selva Kumar" },
    createdAt: "2026-10-01T09:00:00.000Z",
  },
];

export type TaskApiOptions = {
  tasks?: Task[];
  detail?: TaskDetail;
  progress?: TaskProgress[];
  flags?: Partial<Record<TrackingAccessMenu, Flag[]>>;
  /** Refuse create/update with this error. */
  saveError?: { status: number; code: string; message: string; field?: string };
  /** Refuse bulk delete with this error. */
  deleteError?: {
    status: number;
    code: string;
    message: string;
    details?: unknown;
  };
  /** Refuse the import with these row errors. */
  importErrors?: { row: number; field: string; message: string }[];
  /** Two pages: T-1 and its sub-tasks, then T-4 (`?after=`). */
  paged?: boolean;
};

function error(e: {
  status: number;
  code: string;
  message: string;
  field?: string;
  details?: unknown;
}) {
  return Response.json(
    {
      code: e.code,
      message: e.message,
      ...(e.details != null
        ? { details: e.details }
        : e.field == null
          ? {}
          : { details: { field: e.field } }),
    },
    { status: e.status },
  );
}

/** Answers the task screens' reads and writes for one story. */
export function taskHandler(
  options: TaskApiOptions = {},
): (call: ApiCall) => Response | undefined {
  const tasks = options.tasks ?? TASKS;
  const files = mockTrackingDocumentApi({ files: [] });
  return (call) => {
    const document = files(call);
    if (document != null) return document;
    const url = new URL(call.path, "http://storybook.local");
    const path = url.pathname;
    if (path === "/api/construction/tracking/access")
      return Response.json(
        trackingAccess(url.searchParams.get("projectId"), options.flags),
      );
    if (
      /\/api\/construction\/projects\/projects\/[^/]+\/location-options$/.test(
        path,
      )
    )
      return Response.json(TASK_LOCATIONS);
    if (
      call.method === "POST" &&
      path === "/api/construction/masters/tags/ensure"
    ) {
      const body = call.body as { name: string };
      return Response.json(
        { id: "0199c4a0-0000-7000-8000-0000000d0499", name: body.name },
        { status: 201 },
      );
    }
    if (call.method === "GET" && path === `${TASKS_API}/form-options`)
      return Response.json(TASK_FORM_OPTIONS);
    if (
      call.method === "GET" &&
      (path === TASKS_API || path === `${TASKS_API}/gantt`)
    ) {
      const status = url.searchParams.get("status");
      const search = url.searchParams.get("search")?.toLowerCase();
      const items = tasks.filter(
        (item) =>
          (status == null || item.status === status) &&
          (search == null || item.name.toLowerCase().includes(search)),
      );
      if (path.endsWith("/gantt"))
        return Response.json({ items, today: TODAY });
      if (options.paged === true) {
        const second = url.searchParams.has("after");
        const onPage = second ? items.slice(3) : items.slice(0, 3);
        return Response.json({
          items: onPage,
          nextCursor: second ? null : "page-2",
          prevCursor: second ? "page-1" : null,
          total: items.length,
        } satisfies TaskPage);
      }
      return Response.json({
        items,
        nextCursor: null,
        prevCursor: null,
        total: items.length,
      } satisfies TaskPage);
    }
    if (call.method === "POST" && path === TASKS_API)
      return options.saveError == null
        ? Response.json(
            { id: "0199c4a0-0000-7000-8000-0000000d1009" },
            { status: 201 },
          )
        : error(options.saveError);
    if (call.method === "POST" && path === `${TASKS_API}/bulk-delete`) {
      if (options.deleteError != null) return error(options.deleteError);
      const body = call.body as { ids: string[] };
      return Response.json({ deleted: body.ids.length });
    }
    if (call.method === "POST" && path === `${TASKS_API}/import`)
      return options.importErrors == null
        ? Response.json({ imported: 12 }, { status: 201 })
        : error({
            status: 400,
            code: "IMPORT_HAS_ERRORS",
            message: `${String(options.importErrors.length)} problems; nothing was imported.`,
            details: { errors: options.importErrors },
          });
    const progress =
      /^\/api\/construction\/tracking\/tasks\/progress\/([^/]+)\/(update|delete)$/.exec(
        path,
      );
    if (progress != null && call.method === "POST")
      return new Response(null, { status: 204 });
    const item =
      /^\/api\/construction\/tracking\/tasks\/([^/]+)(?:\/([a-z]+))?$/.exec(
        path,
      );
    if (item != null) {
      const [, id, action] = item;
      const detail =
        options.detail ??
        (id === ROOT_ID
          ? SUMMARY_DETAIL
          : taskDetail({ id: id ?? COLUMNS_ID }));
      if (call.method === "GET" && action == null) return Response.json(detail);
      if (call.method === "GET" && action === "progress")
        return Response.json({ items: options.progress ?? PROGRESS });
      if (call.method === "GET" && action === "activity")
        return Response.json({ items: ACTIVITY });
      if (call.method === "POST" && action === "update")
        return options.saveError == null
          ? Response.json(detail)
          : error(options.saveError);
      if (call.method === "POST" && action === "rebaseline")
        return Response.json({
          ...detail,
          baselineVersion: detail.baselineVersion + 1,
        });
      if (
        call.method === "POST" &&
        (action === "progress" || action === "complete")
      )
        return options.saveError == null
          ? Response.json(
              { id: "0199c4a0-0000-7000-8000-0000000d2009" },
              { status: 201 },
            )
          : error(options.saveError);
      if (call.method === "POST" && action === "copy")
        return Response.json(
          { id: "0199c4a0-0000-7000-8000-0000000d1010" },
          { status: 201 },
        );
    }
    return undefined;
  };
}

export function mockTaskApi(options: TaskApiOptions = {}) {
  return mockApi(taskHandler(options));
}
