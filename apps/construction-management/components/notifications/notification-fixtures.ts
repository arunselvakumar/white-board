/**
 * Storybook data and a stateful `fetch` stand-in for the messaging API
 * (CM-904). Never imported by the app.
 */
import { mockApi, type ApiCall } from "../../.storybook/mocks/api";

import type {
  Notification,
  NotificationPreferences,
} from "./notification-queries";
import { MESSAGING_API } from "./notification-queries";

const MINUTE = 60_000;
const PROJECT_ID = "0199c4a0-0000-7000-8000-00000000a001";

function ago(minutes: number): string {
  return new Date(Date.now() - minutes * MINUTE).toISOString();
}

export function notification(extra: Partial<Notification> = {}): Notification {
  return {
    id: "0199c4a0-0000-7000-8000-00000000f001",
    type: "task.assigned",
    menu: "tracking.task",
    group: "project_management",
    projectId: PROJECT_ID,
    title: "Task assigned to you",
    body: "T-2 Ground floor columns · Green Meadows",
    href: `/app/projects/${PROJECT_ID}/tasks`,
    attachment: null,
    readAt: null,
    createdAt: ago(5),
    ...extra,
  };
}

export const TASK_ASSIGNED = notification();

export const PR_WAITING = notification({
  id: "0199c4a0-0000-7000-8000-00000000f002",
  type: "approval.requested",
  menu: "procurement.purchase_request",
  group: "materials",
  title: "Purchase Request waiting for your approval",
  body: "PR/26-27/P1/00012 · 40 bags of cement",
  href: `/app/projects/${PROJECT_ID}/purchase-requests`,
  createdAt: ago(42),
});

export const REPORT_READY = notification({
  id: "0199c4a0-0000-7000-8000-00000000f003",
  type: "report.ready",
  menu: null,
  group: "downloads",
  title: "Your Labour Attendance report is ready",
  body: "1 Oct – 15 Oct 2026",
  href: `/app/projects/${PROJECT_ID}/reports`,
  attachment: {
    kind: "report",
    id: "0199c4a0-0000-7000-8000-00000000c001",
    downloads: [
      { label: "Excel", href: "/api/construction/reporting/reports/r1/xlsx" },
      { label: "PDF", href: "/api/construction/reporting/reports/r1/pdf" },
    ],
  },
  createdAt: ago(1),
});

export const ISSUE_SOLVED = notification({
  id: "0199c4a0-0000-7000-8000-00000000f004",
  type: "issue.solved",
  menu: "tracking.issues",
  group: "project_management",
  title: "Issue marked solved",
  body: "IS-7 Seepage in basement wall",
  href: `/app/projects/${PROJECT_ID}/issues`,
  readAt: ago(60),
  createdAt: ago(3 * 60),
});

export const SALARY_PAID = notification({
  id: "0199c4a0-0000-7000-8000-00000000f005",
  type: "salary.paid",
  menu: "hrms.salary",
  group: "hrms",
  projectId: null,
  title: "Your September salary is paid",
  body: null,
  href: null,
  readAt: ago(26 * 60),
  createdAt: ago(2 * 24 * 60),
});

export const NOTIFICATIONS: Notification[] = [
  REPORT_READY,
  TASK_ASSIGNED,
  PR_WAITING,
  ISSUE_SOLVED,
  SALARY_PAID,
];

/** Older ones for the second page of "Load more". */
export const OLDER_NOTIFICATIONS: Notification[] = [
  notification({
    id: "0199c4a0-0000-7000-8000-00000000f101",
    type: "inspection.approved",
    menu: "tracking.inspections",
    title: "Inspection Request approved",
    body: "IR-3 Slab reinforcement, Wing A",
    readAt: ago(9 * 24 * 60),
    createdAt: ago(10 * 24 * 60),
  }),
  notification({
    id: "0199c4a0-0000-7000-8000-00000000f102",
    type: "stock.below_minimum",
    menu: "procurement.inventory",
    group: "materials",
    title: "Stock below minimum",
    body: "OPC 53 cement · 12 bags left",
    readAt: ago(11 * 24 * 60),
    createdAt: ago(12 * 24 * 60),
  }),
];

export const PREFERENCES: NotificationPreferences = {
  groups: [
    {
      key: "project_management",
      label: "Project Management",
      muted: false,
    },
    { key: "payment_accounting", label: "Payment & Accounting", muted: true },
    { key: "materials", label: "Materials", muted: false },
    { key: "central_store", label: "Central store", muted: false },
    { key: "hrms", label: "HRMS", muted: false },
  ],
};

export const VAPID_PUBLIC_KEY =
  "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";

export type NotificationApiOptions = {
  items?: Notification[];
  /** A second page served after "Load more". */
  older?: Notification[];
  /** Overrides the unread count (e.g. 250 for the 99+ badge). */
  unreadCount?: number;
  latestReadyDownload?: Notification | null;
  preferences?: NotificationPreferences;
  /** null: push is not set up on the server. */
  publicKey?: string | null;
  /** Writes answer 500. */
  failWrites?: boolean;
};

function failure(): Response {
  return Response.json(
    { code: "INTERNAL", message: "Something went wrong." },
    { status: 500 },
  );
}

/** Answers the messaging API from in-story state; writes change it. */
export function mockNotificationApi(options: NotificationApiOptions = {}) {
  let first = [...(options.items ?? NOTIFICATIONS)];
  let older = [...(options.older ?? [])];
  let unreadOverride = options.unreadCount;
  let preferences = options.preferences ?? PREFERENCES;
  const readNow = new Date().toISOString();

  const all = () => [...first, ...older];
  const update = (change: (item: Notification) => Notification | null) => {
    const apply = (items: Notification[]) =>
      items.flatMap((item) => {
        const next = change(item);
        return next == null ? [] : [next];
      });
    first = apply(first);
    older = apply(older);
  };

  const handler = (call: ApiCall): Response | undefined => {
    const url = new URL(call.path, "http://storybook.local");
    const path = url.pathname;
    const base = `${MESSAGING_API}/notifications`;
    const writes = call.method === "POST";
    if (writes && options.failWrites === true) return failure();

    if (call.method === "GET" && path === base) {
      const limit = Number(url.searchParams.get("limit") ?? "20");
      if (url.searchParams.get("cursor") === "page-2")
        return Response.json({ items: older, nextCursor: null });
      return Response.json({
        items: first.slice(0, limit),
        nextCursor: older.length > 0 ? "page-2" : null,
      });
    }
    if (call.method === "GET" && path === `${base}/unread-count`)
      return Response.json({
        count:
          unreadOverride ?? all().filter((item) => item.readAt == null).length,
        latestReadyDownload: options.latestReadyDownload ?? null,
      });
    if (writes && path === `${base}/read-all`) {
      const updated = all().filter((item) => item.readAt == null).length;
      unreadOverride = undefined;
      update((item) => ({ ...item, readAt: item.readAt ?? readNow }));
      return Response.json({ updated });
    }
    const one =
      /^\/api\/construction\/messaging\/notifications\/([^/]+)\/(read|delete)$/.exec(
        path,
      );
    if (writes && one != null) {
      const [, id, action] = one;
      if (action === "delete") {
        update((item) => (item.id === id ? null : item));
        return new Response(null, { status: 204 });
      }
      if (unreadOverride != null)
        unreadOverride = Math.max(0, unreadOverride - 1);
      update((item) =>
        item.id === id ? { ...item, readAt: item.readAt ?? readNow } : item,
      );
      const read = all().find((item) => item.id === id);
      return read == null
        ? Response.json(
            { code: "NOT_FOUND", message: "Notification not found." },
            { status: 404 },
          )
        : Response.json(read);
    }
    if (call.method === "GET" && path === `${MESSAGING_API}/preferences`)
      return Response.json(preferences);
    if (writes && path === `${MESSAGING_API}/preferences/update`) {
      const { mutedGroups } = call.body as { mutedGroups: string[] };
      preferences = {
        groups: preferences.groups.map((group) => ({
          ...group,
          muted: mutedGroups.includes(group.key),
        })),
      };
      return Response.json(preferences);
    }
    if (call.method === "GET" && path === `${MESSAGING_API}/push/config`)
      return Response.json({
        publicKey:
          options.publicKey === undefined
            ? VAPID_PUBLIC_KEY
            : options.publicKey,
      });
    if (writes && path === `${MESSAGING_API}/push-subscriptions`)
      return Response.json(
        { id: "0199c4a0-0000-7000-8000-00000000d001" },
        { status: 201 },
      );
    if (writes && path === `${MESSAGING_API}/push-subscriptions/delete`)
      return new Response(null, { status: 204 });
    return undefined;
  };

  return mockApi(handler);
}

/** The calls a story made to one method and path. */
export function callsTo(
  api: ReturnType<typeof mockNotificationApi>,
  method: string,
  path: string,
): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter(
      (call) =>
        call.method === method &&
        new URL(call.path, "http://storybook.local").pathname === path,
    );
}
