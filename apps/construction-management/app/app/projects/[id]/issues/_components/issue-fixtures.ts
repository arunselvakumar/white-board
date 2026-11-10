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
  Issue,
  IssueDetail,
  IssueFormOptions,
  IssuePage,
  IssueProgress,
} from "@/src/queries/tracking-issues";

/** Story fixtures for Issues & Snags (CM-803). */

export const ISSUES_API = "/api/construction/tracking/issues";
export const ISSUE_PROJECT_ID = "0199c4a0-0000-7000-8000-0000000e0001";
export const CATEGORY_ID = "0199c4a0-0000-7000-8000-0000000e0101";
export const DEPARTMENT_ID = "0199c4a0-0000-7000-8000-0000000e0102";
export const CONTRACTOR_ID = "0199c4a0-0000-7000-8000-0000000e0103";
export const KARTHIK_MEMBER_ID = "0199c4a0-0000-7000-8000-0000000e0104";
export const PLACE_ID = "0199c4a0-0000-7000-8000-0000000e0105";
export const INSPECTION_ID = "0199c4a0-0000-7000-8000-0000000e0106";

export const PENDING_ID = "0199c4a0-0000-7000-8000-0000000e1001";
export const DELAYED_ID = "0199c4a0-0000-7000-8000-0000000e1002";
export const SOLVED_ID = "0199c4a0-0000-7000-8000-0000000e1003";
export const CLOSED_ID = "0199c4a0-0000-7000-8000-0000000e1004";

const TODAY = localToday();
const OWNER = { userId: "user-owner", name: "Arun Selva Kumar" };
const KARTHIK = { userId: "user-karthik", name: "Karthik R" };

export const ISSUE_FORM_OPTIONS: IssueFormOptions = {
  members: [
    {
      id: "0199c4a0-0000-7000-8000-0000000e0107",
      name: "Arun Selva Kumar",
      isOwner: true,
    },
    { id: KARTHIK_MEMBER_ID, name: "Karthik R", isOwner: false },
  ],
  departments: [{ id: DEPARTMENT_ID, name: "Plastering" }],
  contractors: [
    { id: CONTRACTOR_ID, name: "Velan Constructions", departmentIds: [] },
  ],
  issueCategories: [
    { id: CATEGORY_ID, name: "Quality" },
    { id: "0199c4a0-0000-7000-8000-0000000e0108", name: "Safety" },
  ],
};

export const ISSUE_LOCATIONS: LocationOptions = {
  structure: "locations",
  types: ["location"],
  wings: [],
  amenities: [],
  commonDevelopments: [],
  locations: [{ id: PLACE_ID, name: "Pump house" }],
};

/** The viewer's flags on Issues and snags (every flag unless given). */
export function issueAccess(
  projectId: string | null,
  flags: Partial<Record<TrackingAccessMenu, Flag[]>> = {},
): TrackingAccess {
  return {
    projectId: projectId ?? ISSUE_PROJECT_ID,
    menus: {
      "tracking.tasks": [],
      "tracking.inspection_requests": [],
      "masters.tags": [],
      "tracking.issues": [
        "create",
        "read",
        "update",
        "delete",
        "approve",
        "reject",
        "print",
        "notification",
        "view_all",
        "report",
      ],
      ...flags,
    },
  };
}

const ALL_ACTIONS = {
  edit: true,
  delete: true,
  solve: true,
  verify: false,
  reopen: false,
  postUpdate: true,
};

export function issue(extra: Partial<IssueDetail> = {}): IssueDetail {
  return {
    id: PENDING_ID,
    projectId: ISSUE_PROJECT_ID,
    number: "ISS/26-27/00004",
    issueDate: addDays(TODAY, -2),
    details: "Plaster cracks on the east wall of the stair core",
    priority: "high",
    category: { id: CATEGORY_ID, name: "Quality" },
    department: { id: DEPARTMENT_ID, name: "Plastering" },
    contractor: { id: CONTRACTOR_ID, name: "Velan Constructions" },
    assignee: { id: KARTHIK_MEMBER_ID, name: "Karthik R" },
    dueDate: addDays(TODAY, 3),
    siteLocation: { type: "location", locationId: PLACE_ID },
    status: "pending",
    storedStatus: "open",
    solvedAt: null,
    solvedBy: null,
    closedAt: null,
    closedBy: null,
    sourceInspection: null,
    createdBy: OWNER,
    createdAt: "2026-10-12T05:30:00.000Z",
    updatedAt: "2026-10-12T05:30:00.000Z",
    actions: ALL_ACTIONS,
    history: [
      {
        id: "0199c4a0-0000-7000-8000-0000000e2001",
        kind: "created",
        reason: null,
        payload: null,
        by: OWNER,
        at: "2026-10-12T05:30:00.000Z",
      },
    ],
    ...extra,
  };
}

const SOLVED_AT = "2026-10-13T09:15:00.000Z";

export const ISSUES: IssueDetail[] = [
  issue(),
  issue({
    id: DELAYED_ID,
    number: "ISS/26-27/00003",
    issueDate: addDays(TODAY, -9),
    details: "Water seepage near the lift pit",
    priority: "medium",
    dueDate: addDays(TODAY, -2),
    status: "delayed",
    category: { id: CATEGORY_ID, name: "Quality" },
  }),
  issue({
    id: SOLVED_ID,
    number: "ISS/26-27/00002",
    issueDate: addDays(TODAY, -12),
    details: "Loose railing on the second floor landing",
    priority: "low",
    dueDate: null,
    assignee: null,
    status: "solved",
    storedStatus: "solved",
    solvedAt: SOLVED_AT,
    solvedBy: KARTHIK,
    actions: {
      ...ALL_ACTIONS,
      edit: false,
      solve: false,
      verify: true,
      reopen: true,
    },
  }),
  issue({
    id: CLOSED_ID,
    number: "ISS/26-27/00001",
    issueDate: addDays(TODAY, -20),
    details: "Honeycombing on column C4 after deshuttering",
    priority: null,
    status: "closed",
    storedStatus: "closed",
    solvedAt: SOLVED_AT,
    solvedBy: KARTHIK,
    closedAt: "2026-10-13T11:00:00.000Z",
    closedBy: OWNER,
    sourceInspection: { id: INSPECTION_ID, number: "IR/26-27/00007" },
    actions: {
      ...ALL_ACTIONS,
      edit: false,
      solve: false,
      verify: false,
      reopen: true,
    },
  }),
];

export const ISSUE_PROGRESS: IssueProgress[] = [
  {
    id: "0199c4a0-0000-7000-8000-0000000e3001",
    issueId: PENDING_ID,
    body: "Mason called for tomorrow morning.",
    files: [],
    by: KARTHIK,
    createdAt: "2026-10-13T04:00:00.000Z",
    canDelete: false,
  },
  {
    id: "0199c4a0-0000-7000-8000-0000000e3002",
    issueId: PENDING_ID,
    body: "Chiselled out and refilled; curing now.",
    files: [
      trackingFile("Patch done.jpg", {
        id: "0199c4a0-0000-7000-8000-0000000e3101",
        entryId: "0199c4a0-0000-7000-8000-0000000e3002",
        thumbUrl: trackingSwatch("#94a3b8"),
      }),
    ],
    by: OWNER,
    createdAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    canDelete: true,
  },
];

export type IssueApiOptions = {
  issues?: IssueDetail[];
  progress?: IssueProgress[];
  flags?: Partial<Record<TrackingAccessMenu, Flag[]>>;
  /** Refuse create (and update) with this error. */
  saveError?: {
    status: number;
    code: string;
    message: string;
    field?: string;
  };
};

const toItem = (detail: IssueDetail): Issue => {
  const { history: _history, ...item } = detail;
  return item;
};

/** Answers the Issues & Snags screens' reads and writes for one story. */
export function issueHandler(
  options: IssueApiOptions = {},
): (call: ApiCall) => Response | undefined {
  let issues = [...(options.issues ?? ISSUES)];
  /** Transitions stick, so a refetch shows the new status. */
  const save = (next: IssueDetail) => {
    issues = issues.map((entry) => (entry.id === next.id ? next : entry));
    return Response.json(next);
  };
  let progress = [...(options.progress ?? ISSUE_PROGRESS)];
  const documents = mockTrackingDocumentApi({ files: [] });
  const refuse = () => {
    const error = options.saveError;
    if (error == null) return null;
    return Response.json(
      {
        code: error.code,
        message: error.message,
        ...(error.field == null ? {} : { details: { field: error.field } }),
      },
      { status: error.status },
    );
  };
  return (call) => {
    const files = documents(call);
    if (files != null) return files;
    const url = new URL(call.path, "http://storybook.local");
    const path = url.pathname;
    if (path === "/api/construction/tracking/access")
      return Response.json(
        issueAccess(url.searchParams.get("projectId"), options.flags),
      );
    if (
      /\/api\/construction\/projects\/projects\/[^/]+\/location-options$/.test(
        path,
      )
    )
      return Response.json(ISSUE_LOCATIONS);
    if (call.method === "GET" && path === `${ISSUES_API}/form-options`)
      return Response.json(ISSUE_FORM_OPTIONS);
    if (call.method === "GET" && path === ISSUES_API) {
      const statuses = url.searchParams.get("status")?.split(",");
      const priorities = url.searchParams.get("priority")?.split(",");
      const items = issues
        .filter(
          (item) =>
            (statuses == null || statuses.includes(item.status)) &&
            (priorities == null ||
              (item.priority != null && priorities.includes(item.priority))),
        )
        .map(toItem);
      return Response.json({
        items,
        nextCursor: null,
        prevCursor: null,
        total: items.length,
      } satisfies IssuePage);
    }
    if (call.method === "POST" && path === ISSUES_API)
      return (
        refuse() ??
        Response.json(
          { ...issue(), id: "0199c4a0-0000-7000-8000-0000000e1009" },
          { status: 201 },
        )
      );
    const bulk =
      /^\/api\/construction\/tracking\/issues\/bulk-(solve|verify)$/.exec(path);
    if (bulk != null && call.method === "POST") {
      const ids = (call.body as { ids: string[] }).ids;
      const wanted = bulk[1] === "solve" ? "open" : "solved";
      const done = issues.filter(
        (item) => ids.includes(item.id) && item.storedStatus === wanted,
      ).length;
      return Response.json({ done, skipped: ids.length - done });
    }
    const thread =
      /^\/api\/construction\/tracking\/issues\/([^/]+)\/progress(?:\/([^/]+)\/delete)?$/.exec(
        path,
      );
    if (thread != null) {
      const [, id = "", updateId] = thread;
      if (call.method === "GET")
        return Response.json({
          items: progress.filter((item) => item.issueId === id),
        });
      if (call.method === "POST" && updateId != null) {
        progress = progress.filter((item) => item.id !== updateId);
        return new Response(null, { status: 204 });
      }
      if (call.method === "POST") {
        const body = call.body as { body: string | null; fileIds: string[] };
        const added: IssueProgress = {
          id: `0199c4a0-0000-7000-8000-0000000e3${String(progress.length + 100).padStart(3, "0")}`,
          issueId: id,
          body: body.body,
          files: body.fileIds.map((fileId) =>
            trackingFile("Update photo.jpg", { id: fileId, entryId: id }),
          ),
          by: OWNER,
          createdAt: new Date().toISOString(),
          canDelete: true,
        };
        progress = [...progress, added];
        return Response.json(added, { status: 201 });
      }
    }
    const item =
      /^\/api\/construction\/tracking\/issues\/([^/]+)(?:\/([a-z]+))?$/.exec(
        path,
      );
    if (item != null) {
      const [, id, action] = item;
      const found = issues.find((entry) => entry.id === id) ?? issue();
      if (call.method === "GET" && action == null) return Response.json(found);
      if (call.method === "POST" && action === "update")
        return refuse() ?? Response.json(found);
      if (call.method === "POST" && action === "solve")
        return save({
          ...found,
          status: "solved",
          storedStatus: "solved",
          solvedAt: new Date().toISOString(),
          solvedBy: OWNER,
          actions: {
            ...found.actions,
            edit: false,
            solve: false,
            verify: true,
            reopen: true,
          },
        } satisfies IssueDetail);
      if (call.method === "POST" && action === "verify")
        return save({
          ...found,
          status: "closed",
          storedStatus: "closed",
          closedAt: new Date().toISOString(),
          closedBy: OWNER,
          actions: { ...found.actions, verify: false },
        } satisfies IssueDetail);
      if (call.method === "POST" && action === "reopen")
        return save({
          ...found,
          status: "pending",
          storedStatus: "open",
          solvedAt: null,
          solvedBy: null,
          closedAt: null,
          closedBy: null,
          actions: {
            ...found.actions,
            edit: true,
            solve: true,
            verify: false,
            reopen: false,
          },
        } satisfies IssueDetail);
      if (call.method === "POST" && action === "delete")
        return new Response(null, { status: 204 });
    }
    return undefined;
  };
}

export function mockIssueApi(options: IssueApiOptions = {}) {
  return mockApi(issueHandler(options));
}
