import type { SiteWorkAccessMenu } from "@/app/api/construction/site-work/access/access-models";
import { siteWorkAccess } from "@/components/site-work/site-diary/site-diary-fixtures";
import type {
  ProgressReport,
  ProgressReportFormOptions,
} from "@/src/queries/progress-reports";
import type { Flag } from "@/src/shared-kernel/access";

import type { ApiCall } from "../../../.storybook/mocks/api";

export const PROGRESS_PROJECT_ID = "0199c4a0-0000-7000-8000-0000000d0001";
export const PROGRESS_TODAY = "2026-10-11";
const API = "/api/construction/site-work/progress-reports";

const OWNER = { userId: "user-owner", name: "Arun Selva Kumar" };
const ENGINEER = { userId: "user-engineer", name: "Prabhu Saravanan" };

export function progressReport(
  extra: Partial<ProgressReport> = {},
): ProgressReport {
  const id = extra.id ?? "0199c4a0-0000-7000-8000-0000000d1001";
  const date = extra.date === undefined ? "2026-10-10" : extra.date;
  return {
    id,
    projectId: PROGRESS_PROJECT_ID,
    kind: "daily_progress_report",
    number: "DPR/26-27/00003",
    date,
    from: date ?? "2026-10-01",
    to: date ?? "2026-10-10",
    filledBy: null,
    includeImages: true,
    status: "done",
    error: null,
    includesMoney: true,
    requestedBy: OWNER,
    createdAt: "2026-10-10T12:30:00.000Z",
    finishedAt: "2026-10-10T12:30:04.000Z",
    download: `${API}/${id}/download`,
    actions: { download: true, retry: false, delete: true },
    ...extra,
  };
}

export const READY = progressReport();
export const RUNNING = progressReport({
  id: "0199c4a0-0000-7000-8000-0000000d1002",
  number: "DPR/26-27/00004",
  date: "2026-10-11",
  status: "running",
  filledBy: ENGINEER,
  finishedAt: null,
  download: null,
  actions: { download: false, retry: false, delete: true },
});
export const FAILED = progressReport({
  id: "0199c4a0-0000-7000-8000-0000000d1003",
  number: "DPR/26-27/00002",
  date: "2026-10-09",
  status: "failed",
  error:
    "The report took longer than 60 seconds and was stopped. Retry it, or generate it without images.",
  download: null,
  actions: { download: false, retry: true, delete: true },
});

/** A Task Progress Report for the month so far (CM-805): no number, no filters. */
export const TASK_PROGRESS = progressReport({
  id: "0199c4a0-0000-7000-8000-0000000d1004",
  kind: "task_progress_report",
  number: null,
  date: null,
  from: "2026-10-01",
  to: "2026-10-10",
  includeImages: false,
  includesMoney: false,
});

export const FORM_OPTIONS: ProgressReportFormOptions = {
  today: PROGRESS_TODAY,
  teamMembers: [
    { ...OWNER, isOwner: true },
    { ...ENGINEER, isOwner: false },
  ],
  types: [
    {
      key: "daily_progress_report",
      label: "Daily Progress Report",
      available: true,
      note: null,
    },
    {
      key: "task_progress_report",
      label: "Task Progress Report",
      available: true,
      note: null,
    },
  ],
};

export type ProgressReportApiOptions = {
  reports?: ProgressReport[];
  flags?: Partial<Record<SiteWorkAccessMenu, Flag[]>>;
};

/** Answers the Progress Reports module's reads and writes for one story. */
export function progressReportHandler(
  options: ProgressReportApiOptions = {},
): (call: ApiCall) => Response | undefined {
  let reports = [
    ...(options.reports ?? [RUNNING, TASK_PROGRESS, READY, FAILED]),
  ];
  return (call) => {
    const url = new URL(call.path, "http://storybook.local");
    const path = url.pathname;
    if (path === "/api/construction/site-work/access")
      return Response.json(
        siteWorkAccess(url.searchParams.get("projectId"), options.flags),
      );
    if (call.method === "GET" && path === `${API}/form-options`)
      return Response.json(FORM_OPTIONS);
    if (call.method === "GET" && path === API)
      return Response.json({ items: reports });
    if (call.method === "POST" && path === API) {
      const body = call.body as {
        kind?: string;
        date?: string;
        from?: string;
        to?: string;
      };
      const created =
        body.kind === "task_progress_report"
          ? progressReport({
              ...TASK_PROGRESS,
              id: "0199c4a0-0000-7000-8000-0000000d1008",
              from: body.from ?? "",
              to: body.to ?? "",
            })
          : progressReport({
              id: "0199c4a0-0000-7000-8000-0000000d1009",
              number: "DPR/26-27/00005",
              date: body.date ?? null,
            });
      reports = [created, ...reports];
      return Response.json(created, { status: 201 });
    }
    const retry = /^.*\/([^/]+)\/retry$/.exec(path);
    if (call.method === "POST" && retry != null) {
      reports = reports.map((report) =>
        report.id === retry[1]
          ? progressReport({
              ...report,
              status: "done",
              error: null,
              download: `${API}/${report.id}/download`,
              actions: { download: true, retry: false, delete: true },
            })
          : report,
      );
      return Response.json(reports.find((report) => report.id === retry[1]));
    }
    const remove = /^.*\/([^/]+)\/delete$/.exec(path);
    if (call.method === "POST" && remove != null) {
      reports = reports.filter((report) => report.id !== remove[1]);
      return new Response(null, { status: 204 });
    }
    return undefined;
  };
}
